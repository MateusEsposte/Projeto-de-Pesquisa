from django.conf import settings
from django.http import JsonResponse, FileResponse
from django.views.decorators.csrf import csrf_exempt
from owlready2 import *
import re
from owlready2 import get_ontology
from owlready2 import ObjectPropertyClass as ObjectProperty 
import os, traceback, json, types, re, logging, datetime
logger = logging.getLogger(__name__)
from types import new_class
from owlready2 import (
    Thing, ObjectPropertyClass, DataPropertyClass,
    AnnotationPropertyClass, FunctionalProperty, ObjectProperty,
    TransitiveProperty, SymmetricProperty, 
    Or, And, Not, Thing, ObjectPropertyClass, DataPropertyClass, 
    AnnotationPropertyClass, DataProperty, normstr, locstr
)


# --- utilidades para resolver / sanitizar nomes/IRIs -------------------


def sanitize_local_name(name: str) -> str:
    """
    Gera um identificador RDF/Python-safe a partir de uma string.
    Ex.: "Poço Produção #1" -> "Poco_Producao_1"
    Mantém só ASCII, letras/dígitos/underscore, e garante não começar com dígito.
    """
    if name is None:
        return None
    # normalize: remove acentos
    import unicodedata
    s = unicodedata.normalize("NFKD", name).encode("ASCII", "ignore").decode("ASCII")
    # keep letters/numbers/underscore
    s = re.sub(r'[^0-9A-Za-z_]+', '_', s).strip('_')
    # ensure it does not begin with digit
    if re.match(r'^[0-9]', s):
        s = f"n_{s}"
    if not s:
        s = "entity"
    return s

def resolve_individual(onto, identifier: str):
    """
    Tenta localizar um indivíduo pela (1) IRI exata, (2) local name no fim do IRI,
    (3) label (rdfs:label), (4) atributo .name exato, (5) sanitizado.
    Retorna o indivíduo Owlready2 ou None.
    """
    if identifier is None:
        return None

    # 1) se é IRI completo
    if identifier.startswith("http://") or identifier.startswith("https://") or identifier.startswith("urn:"):
        ind = onto.search_one(iri=identifier)
        if ind:
            return ind

    # 2) busca por IRI terminado com local name (wildcard)
    ind = onto.search_one(iri=f"*{identifier}")
    if ind:
        return ind

    # 3) busca por rdfs:label
    ind = onto.search_one(label=identifier)
    if ind:
        return ind

    # 4) busca por name exato (o nome do atributo Python)
    try:
        ind = getattr(onto, identifier)
        if ind:
            return ind
    except Exception:
        pass

    # 5) tentar buscar com sanitizado (caso tenha sido salvo com sanitized name)
    sanitized = sanitize_local_name(identifier)
    ind = onto.search_one(iri=f"*{sanitized}") or onto.search_one(label=sanitized) or (getattr(onto, sanitized, None))
    if ind:
        return ind

    return None


def individual_to_dict(ind):
    """
    Serializa indivíduo de forma mais robusta: name, iri, label (se houver), classes, properties...
    """
    def value_to_str(v):
        # indivíduo:
        try:
            if hasattr(v, 'iri'):
                # preferir label se existir
                lab = v.label.first() if hasattr(v, 'label') and v.label else None
                return {"type": "individual", "name": getattr(v, "name", None), "label": lab, "iri": str(v.iri)}
        except Exception:
            pass
        # literal/primitive
        try:
            return {"type": "literal", "value": v.toPython() if hasattr(v, "toPython") else str(v)}
        except Exception:
            return {"type": "literal", "value": str(v)}

    props = {}
    for p in ind.get_properties():
        try:
            vals = getattr(ind, p.name)
            if not isinstance(vals, list):
                vals = [vals]
            props[p.name] = [value_to_str(v) for v in vals]
        except Exception:
            props[p.name] = []
    return {
        "name": getattr(ind, "name", None),
        "iri": str(getattr(ind, "iri", "")),
        "label": ind.label.first() if ind.label else None,
        "classes": [c.name for c in ind.is_a if hasattr(c, "name")],
        "properties": props
    }

onto_path = ""
onto = None

def build_entity_hierarchy(entity):
    def get_all_subclasses(entity):
        subs = []
        for sub in sorted(entity.subclasses(), key=lambda x: x.name or ""):
            subs.append({
                'name': sub.name,
                'children': get_all_subclasses(sub)
            })
        return subs
    return {
        'name': entity.name,
        'children': get_all_subclasses(entity)
    }

def serialize_entity(entity):
    return {
        'name': entity.name,
        'iri': entity.iri,
        'comment': entity.comment.first() if entity.comment else ''
    }


def serialize_individual(ind):
    # prepara dicionário
    ind_dict = {}

    # local name helper
    def local_name(iri):
        s = str(iri)
        if '#' in s:
            return s.split('#')[-1]
        return s.rstrip('/').split('/')[-1]

    # IRI do indivíduo (owlready2: ind.iri costuma existir)
    ind_dict['iri'] = getattr(ind, 'iri', None) or str(ind)

    # tipos (names) e tipos locais (local_name)
    types = []
    types_local = []
    for cls in getattr(ind, 'is_a', []):
        try:
            # cls pode ser objeto de classe OWL ou string
            name = getattr(cls, 'name', None) or str(cls)
            types.append(name)
            types_local.append(local_name(getattr(cls, 'iri', name)))
        except Exception:
            types.append(str(cls))
            types_local.append(local_name(str(cls)))

    ind_dict['type'] = types
    ind_dict['types_local'] = types_local

    # sinalizador direto útil pro frontend
    ind_dict['is_well'] = any(re.search(r'\b(well|po[cç]o)\b', t, re.I) for t in types_local + types)

    # nome/label
    ind_dict['name'] = getattr(ind, 'name', None)
    # tenta labels (rdfs:label) se existirem
    try:
        labels = list(ind.label) if hasattr(ind, 'label') else []
        ind_dict['label'] = labels if labels else None
    except Exception:
        ind_dict['label'] = None

    # propriedades (seguro)
    def process_value(v):
        # se for indivíduo owlready2
        if hasattr(v, 'name'):
            return getattr(v, 'name', str(v))
        # listas/tuplas -> serializar cada item
        if isinstance(v, (list, tuple)):
            return [process_value(x) for x in v]
        # fallback
        return str(v)

    properties_data = {}
    for prop in ind.get_properties():
        try:
            values = getattr(ind, prop.name)
            if values is None:
                properties_data[prop.name] = []
            else:
                if not isinstance(values, (list, tuple)):
                    values = [values]
                properties_data[prop.name] = [process_value(v) for v in values]
        except AttributeError:
            properties_data[prop.name] = []
        except Exception:
            properties_data[prop.name] = ["ErroAoAcessar"]
    ind_dict['properties'] = properties_data

    return ind_dict


def serialize_property(prop):
    try:
        from owlready2 import And, Or, FunctionalProperty, TransitiveProperty, SymmetricProperty, ObjectProperty

        # Helper para extrair nomes de classes de expressões lógicas (And/Or)
        def extract_classes(item):
            if isinstance(item, (And, Or)):
                return [extract_classes(c) for c in item.Classes]
            elif hasattr(item, 'name'):
                return item.name
            else:
                return str(item)

        # Converter IRI para string e garantir valores padrão
        prop_data = {
            'name': getattr(prop, 'name', ''),
            'iri': str(getattr(prop, 'iri', '')),
            'domain': [],
            'range': [],
            'is_functional': False,
            'is_transitive': False,
            'is_symmetric': False,
            'error': None
        }

        # Verificar se é uma propriedade de objeto
        if not isinstance(prop, ObjectProperty):
            prop_data['error'] = 'Tipo de propriedade não suportado'
            return prop_data

        # Processar domínio
        domain = getattr(prop, 'domain', [])
        if not isinstance(domain, list):
            domain = [domain]
        prop_data['domain'] = [extract_classes(item) for item in domain]

        # Processar range
        prop_range = getattr(prop, 'range', [])
        if not isinstance(prop_range, list):
            prop_range = [prop_range]
        prop_data['range'] = [extract_classes(item) for item in prop_range]

        # Verificar características especiais
        prop_data['is_functional'] = isinstance(prop, FunctionalProperty)
        prop_data['is_transitive'] = isinstance(prop, TransitiveProperty)
        prop_data['is_symmetric'] = isinstance(prop, SymmetricProperty)

        return prop_data

    except Exception as e:
        # Log detalhado para debug
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Erro serializando propriedade {prop}: {str(e)}", exc_info=True)
        
        return {
            'name': getattr(prop, 'name', 'ErroDesconhecido'),
            'error': str(e)
        }
    

@csrf_exempt
def load_ontology_view(request):
    global world, onto, onto_path
    if request.method == 'POST':
        if 'ontology_file' not in request.FILES:
            return JsonResponse({'status': 'error', 'message': 'Nenhum arquivo enviado'}, status=400)
        try:
            logger.info(f"[LOAD] onto id: {id(onto)}, onto_path: {onto_path!r}")
            file = request.FILES['ontology_file']
            media_dir = settings.MEDIA_ROOT
            os.makedirs(media_dir, exist_ok=True)
            path = os.path.join(media_dir, file.name)
            with open(path, 'wb+') as dest:
                for chunk in file.chunks(): dest.write(chunk)

            onto_path = path
            onto = get_ontology(path).load()
            # sync_reasoner()

            all_classes = list(onto.classes())
            roots = [c for c in onto.classes() if Thing in c.is_a] or all_classes

            datatypes = {rng.name for p in onto.data_properties() for rng in getattr(p, 'range', []) if hasattr(rng, 'name')}
            datatypes |= {'xsd:string','xsd:integer','xsd:float','xsd:boolean','xsd:dateTime'}

            data = {
                'classes': [build_entity_hierarchy(c) for c in roots],
                'classes_count': len(all_classes),
                'object_properties': [serialize_property(p) for p in onto.object_properties()],
                'data_properties': [serialize_property(p) for p in onto.data_properties()],
                'annotation_properties': [serialize_property(p) for p in onto.annotation_properties()],
                'individuals': [serialize_individual(i) for i in onto.individuals()],
                'datatypes': list(datatypes)
            }
            return JsonResponse({'status':'success','message':'Ontologia carregada!','ontology':data})
        except Exception as e:
            traceback.print_exc()
            return JsonResponse({'status':'error','message':str(e)}, status=400)
    return JsonResponse({'status':'error','message':'Método não permitido'}, status=405)

@csrf_exempt
def current_ontology_view(request):
    """
    GET /api/current-ontology/
    Retorna o objeto da ontologia atual (pelo menos a lista de indivíduos serializados).
    """
    if request.method != 'GET':
        return JsonResponse({'status': 'error', 'message': 'Método não permitido'}, status=405)

    try:
        global onto
        if onto is None:
            return JsonResponse({'status': 'error', 'message': 'Nenhuma ontologia carregada'}, status=400)

        individuals = [serialize_individual(i) for i in onto.individuals()]
        return JsonResponse({'status': 'success', 'ontology': {'individuals': individuals}}, status=200)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@csrf_exempt
def create_class_view(request):
    global onto
    if onto is None:
        return JsonResponse({'status': 'error', 'message': 'Nenhuma ontologia carregada'}, status=400)

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            class_name = data.get('name')
            parent_names = data.get('parents', [])
            

            if not class_name:
                return JsonResponse({'status': 'error', 'message': 'Nome da classe é obrigatório'}, status=400)

            with onto:
                # Definindo classes-pai
                if parent_names:
                    parents = []
                    for parent_name in parent_names:
                        parent_cls = onto.search_one(iri="*" + parent_name)
                        if not parent_cls:
                            return JsonResponse({'status': 'error', 'message': f'Classe pai "{parent_name}" não encontrada'}, status=400)
                        parents.append(parent_cls)
                else:
                    parents = [Thing]

                # Criando a nova classe
                NewClass = types.new_class(class_name, tuple(parents))

            # Atualizar a árvore de classes
            all_classes = list(onto.classes())
            root_classes = [cls for cls in onto.classes() if Thing in cls.is_a]
            if not root_classes:
                root_classes = all_classes

            ontology_data = {
                'classes': [build_entity_hierarchy(cls) for cls in root_classes],
                'classes_count': len(all_classes)
            }

            return JsonResponse({'status': 'success', 'message': 'Classe criada com sucesso', 'ontology': ontology_data})

        except Exception as e:
            traceback.print_exc()
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    return JsonResponse({'status': 'error', 'message': 'Método não permitido'}, status=405)

@csrf_exempt
def export_ontology_view(request):
    if onto is None:
        return JsonResponse({'status': 'error', 'message': 'Nenhuma ontologia carregada'}, status=400)

    try:
        filename = request.GET.get('filename', 'ontology.owl')
        if not filename.endswith('.owl'):
            filename += '.owl'

        export_path = os.path.join(settings.MEDIA_ROOT, filename)
        onto.save(file=export_path, format="rdfxml")

        return FileResponse(open(export_path, 'rb'), as_attachment=True, filename=filename)

    except Exception as e:
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
    

@csrf_exempt
def create_annotation_property_view(request):
    global onto
    if onto is None: return JsonResponse({'status':'error','message':'Nenhuma ontologia carregada'},status=400)
    if request.method!='POST': return JsonResponse({'status':'error','message':'Método não permitido'},status=405)
    try:
        data=json.loads(request.body)
        name, domains = data.get('name'), data.get('domain',[])
        if not name: return JsonResponse({'status':'error','message':'Nome é obrigatório'},status=400)
        with onto:
            New = types.new_class(name, (AnnotationPropertyClass,))
            New.namespace = onto
            if domains:
                New.domain = [d for d in domains if d]

            onto.save(file=onto_path, format="rdfxml")
            onto = get_ontology(onto_path).load()
        return JsonResponse({'status':'success','message':'AnnotationProperty criada','annotation_properties':[serialize_property(p) for p in onto.annotation_properties()]})
    except Exception as e:
        traceback.print_exc(); return JsonResponse({'status':'error','message':str(e)},status=500)

@csrf_exempt
def create_individual_view(request):
    global onto
    if onto is None:
        return JsonResponse({'status': 'error', 'message': 'Nenhuma ontologia carregada'}, status=400)
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Método não permitido'}, status=405)
    try:
        data = json.loads(request.body)
        individual_name = data.get('name')
        class_names = data.get('classes', [])
        properties = data.get('properties', {})
        annotations = data.get('annotations', {})
        obj_props = data.get('object_properties', {})
        description = data.get('description', {})
        same_as = data.get('same_as', [])
        different_from = data.get('different_from', [])

        if not individual_name:
            return JsonResponse({'status': 'error', 'message': 'Nome do indivíduo é obrigatório'}, status=400)
        if not class_names:
            return JsonResponse({'status': 'error', 'message': 'Pelo menos uma classe deve ser especificada'}, status=400)

        with onto:
            # instantiate classes
            classes = []
            for cls_name in class_names:
                ontology_class = onto.search_one(iri=f"*{cls_name}") or onto.search_one(label=cls_name)
                if not ontology_class:
                    return JsonResponse({'status': 'error', 'message': f'Classe "{cls_name}" não encontrada'}, status=400)
                classes.append(ontology_class)

            # create individual
            with onto:
                # prepare sanitized id and label
                sanitized = sanitize_local_name(individual_name)
                # verificar conflito: se já existir objeto com sanitized name, acrescentar sufixo
                base = sanitized
                suffix = 0
                while onto.search_one(iri=f"*{sanitized}") is not None:
                    suffix += 1
                    sanitized = f"{base}_{suffix}"

                # criar indivíduo com nome sanitized (assegura IRI válido), e definir rdfs:label com nome original
                NewInd = classes[0](sanitized)
                # set label (annotation)
                try:
                    NewInd.label.append(individual_name)
                except Exception:
                    pass

                # adicionar outras classes se necessário
                if len(classes) > 1:
                    NewInd.is_a.extend(classes[1:])

                # agora atribuir data properties como antes, mas resolvendo props por name/iri
                # (use a sua lógica já existente para propriedades, mas referencie o objeto NewInd em vez de new_individual)
                # ex.: processed assignment (copiar a lógica de processed -> append / set)


            # data properties
            for prop_name, values in properties.items():
                prop = onto.search_one(iri=f"*{prop_name}") or onto.search_one(label=prop_name)
                if not prop or not isinstance(prop, DataPropertyClass):
                    continue
                # Process values into Python native types instead of rdflib Literals
                processed = []
                for item in values:
                    val = item.get('value')
                    lang = item.get('lang')
                    dt_uri = item.get('datatype')
                    if val is None:
                        continue
                    # Convert to Python type based on datatype
                    if dt_uri and dt_uri.startswith('xsd:'):
                        t = dt_uri[4:]
                        try:
                            if t in ('integer', 'int'):
                                py_val = int(val)
                            elif t in ('float', 'double', 'decimal'):
                                py_val = float(val)
                            elif t in ('boolean',):
                                py_val = val.lower() in ('true', '1')
                            else:
                                py_val = val
                        except Exception:
                            py_val = val
                    else:
                        py_val = val
                    processed.append(py_val)
                # Assign to the individual
                if isinstance(prop, FunctionalProperty) and processed:
                    setattr(NewInd, prop.name, processed[0])
                else:
                    for v in processed:
                        getattr(NewInd, prop.name).append(v)

            # object properties
            for prop_name, targets in obj_props.items():
                prop = onto.search_one(iri=f"*{prop_name}") or onto.search_one(label=prop_name)
                if not prop or not isinstance(prop, ObjectPropertyClass):
                    continue
                for t in targets:
                    target_ind = onto.search_one(iri=f"*{t}") or onto.search_one(label=t)
                    if target_ind:
                        getattr(NewInd, prop.name).append(target_ind)

            # annotations
            for anno_name, values in annotations.items():
                prop = onto.search_one(iri=f"*{anno_name}") or onto.search_one(label=anno_name)
                if not prop or not isinstance(prop, AnnotationPropertyClass):
                    continue
                for v in values:
                    prop[NewInd].append(v)

            # description, same_as, different_from
            for extra in description.get('types', []):
                cls = onto.search_one(iri=f"*{extra}") or onto.search_one(label=extra)
                if cls:
                    NewInd.is_a.append(cls)
            for same in same_as:
                other = onto.search_one(iri=f"*{same}") or onto.search_one(label=same)
                if other:
                    NewInd.same_as.append(other)
            for diff in different_from:
                other = onto.search_one(iri=f"*{diff}") or onto.search_one(label=diff)
                if other:
                    NewInd.different_from.append(other)

            onto.save(file=onto_path, format="rdfxml")

        return JsonResponse({
            'status': 'success',
            'message': 'Indivíduo criado!',
            'ontology': {'individuals': [serialize_individual(i) for i in onto.individuals()]}
        })
    except Exception as e:
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
def list_data_properties_view(request):
    if onto is None:
        return JsonResponse({'status': 'error', 'message': 'Nenhuma ontologia carregada'}, status=400)

    try:
        data_properties = [
            serialize_property(prop) for prop in onto.data_properties()
        ]
        return JsonResponse({'status': 'success', 'data_properties': data_properties})

    except Exception as e:
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@csrf_exempt
def list_object_properties_view(request):
    """
    GET: retorna todas as ObjectProperties definidas na ontologia,
         com domínio e range (se houver).
    """
    global onto
    if onto is None:
        return JsonResponse({'status': 'error', 'message': 'Nenhuma ontologia carregada'}, status=400)

    if request.method != 'GET':
        return JsonResponse({'status': 'error', 'message': 'Método não permitido'}, status=405)

    try:
        props = []
        for prop in onto.object_properties():
            # domínio e range podem ser listas vazias
            domains = [cls.name for cls in getattr(prop, "domain", [])]
            ranges  = [cls.name for cls in getattr(prop, "range",  [])]
            props.append({
                'name':       prop.name,
                'iri':        prop.iri,
                'label':      prop.label.first() or None,
                'domain':     domains,
                'range':      ranges,
                'is_functional': isinstance(prop, ObjectPropertyClass) and prop.is_functional,
            })

        return JsonResponse({
            'status':            'success',
            'object_properties': props
        })

    except Exception as e:
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@csrf_exempt
def relationship_manager_view(request):
    global onto
    if onto is None:
        return JsonResponse({'status': 'error', 'message': 'Nenhuma ontologia carregada'}, status=400)

    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Método não permitido'}, status=405)

    try:
        data = json.loads(request.body)
        subject_name = data.get('subject')
        object_property_name = data.get('object_property')
        target_name = data.get('target')
        action = data.get('action')
        replace_with_name = data.get('replace_with')

        if not subject_name or not object_property_name or not action:
            return JsonResponse({'status': 'error', 'message': 'Parâmetros obrigatórios ausentes'}, status=400)

        with onto:
            # Localiza indivíduos e propriedade
            subject = resolve_individual(onto, subject_name)
            if not subject:
                return JsonResponse({'status': 'error', 'message': f'Indivíduo sujeito "{subject_name}" não encontrado'}, status=404)

            if not subject:
                return JsonResponse({'status': 'error', 'message': f'Indivíduo sujeito "{subject_name}" não encontrado'}, status=404)

            obj_prop = onto.search_one(iri=f"*{object_property_name}") or onto.search_one(label=object_property_name)
            if not obj_prop or not isinstance(obj_prop, ObjectPropertyClass):
                return JsonResponse({'status': 'error', 'message': f'Propriedade "{object_property_name}" não encontrada ou não é uma ObjectProperty'}, status=400)

            if action == 'add':
                target = resolve_individual(onto, target_name)
                if not target:
                    return JsonResponse({'status': 'error', 'message': f'Indivíduo destino "{target_name}" não encontrado'}, status=404)
                getattr(subject, obj_prop.name).append(target)

            elif action == 'remove':
                target = resolve_individual(onto, target_name)
                if not target:
                    return JsonResponse({'status': 'error', 'message': f'Indivíduo destino "{target_name}" não encontrado'}, status=404)
                current_values = getattr(subject, obj_prop.name)
                if target in current_values:
                    current_values.remove(target)
                else:
                    return JsonResponse({'status': 'error', 'message': f'Relação não encontrada entre "{subject_name}" e "{target_name}" via "{object_property_name}"'}, status=404)

            elif action == 'replace':
                if not replace_with_name:
                    return JsonResponse({'status': 'error', 'message': 'Parâmetro "replace_with" obrigatório para ação replace'}, status=400)
                old_target = resolve_individual(onto, target_name)
                new_target = resolve_individual(onto, replace_with_name)
                if not old_target or not new_target:
                    return JsonResponse({'status': 'error', 'message': 'Indivíduos de origem ou destino não encontrados'}, status=404)
                current_values = getattr(subject, obj_prop.name)
                if old_target in current_values:
                    current_values.remove(old_target)
                    current_values.append(new_target)
                else:
                    return JsonResponse({'status': 'error', 'message': f'Relação original não encontrada entre "{subject_name}" e "{target_name}"'}, status=404)

            else:
                return JsonResponse({'status': 'error', 'message': 'Ação inválida. Use "add", "remove" ou "replace"'}, status=400)

            # Salva alterações
            onto.save(file=onto_path, format="rdfxml")

        # Atualiza lista de indivíduos na resposta
        updated_individuals = [serialize_individual(ind) for ind in onto.individuals()]

        return JsonResponse({'status': 'success', 'message': 'Relacionamento atualizado com sucesso!', 'ontology': {'individuals': updated_individuals}})

    except Exception as e:
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@csrf_exempt
def create_object_property_view(request):
    global onto, onto_path

    if onto is None and onto_path:
        onto = get_ontology(onto_path).load()

    if onto is None:
        return JsonResponse({'status': 'error', 'message': 'Nenhuma ontologia carregada'}, status=400)

    try:
        data = json.loads(request.body)
        name = data.get('property_name')
        domain_names = data.get('domain', [])
        range_names = data.get('range', [])
        characteristics = data.get('characteristics', [])

        if not name:
            return JsonResponse({'status': 'error', 'message': 'Nome é obrigatório'}, status=400)

        # Busca por classes de domínio
        domains = []
        for domain_name in domain_names:
            cls = onto.search_one(iri=f"*{domain_name}") or onto.search_one(label=domain_name)
            if not cls:
                return JsonResponse({'status': 'error', 'message': f'Domínio "{domain_name}" não encontrado'}, status=400)
            domains.append(cls)

        # Busca por classes de range
        ranges = []
        for range_name in range_names:
            cls = onto.search_one(iri=f"*{range_name}") or onto.search_one(label=range_name)
            if not cls:
                return JsonResponse({'status': 'error', 'message': f'Range "{range_name}" não encontrado'}, status=400)
            ranges.append(cls)

        with onto:
            # Criação da nova propriedade seguindo padrão Owlready2
            NewProperty = new_class(name, (ObjectProperty,))
            NewProperty.namespace = onto

            # Define domínio
            if domains:
                NewProperty.domain = domains if len(domains) == 1 else [And(domains)]

            # Define range
            if ranges:
                NewProperty.range = ranges if len(ranges) == 1 else [And(ranges)]

            # Define características
            if 'functional' in [c.lower() for c in characteristics]:
                NewProperty.is_a.append(FunctionalProperty)
            if 'transitive' in [c.lower() for c in characteristics]:
                NewProperty.is_a.append(TransitiveProperty)
            if 'symmetric' in [c.lower() for c in characteristics]:
                NewProperty.is_a.append(SymmetricProperty)

            # Salva a ontologia atualizada
            onto.save(file=onto_path, format="rdfxml")

        # Retorna a lista atualizada
        object_properties = [serialize_property(p) for p in onto.object_properties()]
        return JsonResponse({
            'status': 'success',
            'message': 'Propriedade criada com sucesso',
            'object_properties': object_properties
        })

    except Exception as e:
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@csrf_exempt
def create_data_property_view(request):
    global onto, onto_path

    # Carrega ontologia se ainda não estiver em memória
    if onto is None and onto_path:
        onto = get_ontology(onto_path).load()

    if onto is None:
        return JsonResponse({'status': 'error', 'message': 'Nenhuma ontologia carregada'}, status=400)

    try:
        data = json.loads(request.body)
        name = data.get('property_name')
        domain_names = data.get('domain', [])
        data_type_str = data.get('range')  # ex: "str", "int", "xsd:float", etc.
        characteristics = data.get('characteristics', [])

        if not name:
            return JsonResponse({'status': 'error', 'message': 'Nome é obrigatório'}, status=400)
        if not data_type_str:
            return JsonResponse({'status': 'error', 'message': 'Tipo de dado (range) é obrigatório'}, status=400)

        # Mapeamento dos tipos de dados para OwlReady2 (tipos Python nativos)
        type_map = {
            'str': str,
            'normstr': normstr,
            'locstr': locstr,
            'int': int,
            'float': float,
            'bool': bool,
            'date': datetime.date,
            'time': datetime.time,
            'datetime': datetime.datetime,
        }

        # Normaliza chave, removendo prefixo xsd: se presente
        key = data_type_str.lower()
        if key.startswith('xsd:'):
            key = key.split(':', 1)[1]

        data_type = type_map.get(key)
        if data_type is None:
            return JsonResponse({'status': 'error', 'message': f'Tipo de dado "{data_type_str}" não suportado'}, status=400)

        # Busca por classes de domínio
        domains = []
        for domain_name in domain_names:
            cls = onto.search_one(iri=f"*{domain_name}") or onto.search_one(label=domain_name)
            if not cls:
                return JsonResponse({'status': 'error', 'message': f'Domínio "{domain_name}" não encontrado'}, status=400)
            domains.append(cls)

        with onto:
            # Criação da nova propriedade usando types.new_class
            NewDataProp = types.new_class(name, (DataProperty,))
            NewDataProp.namespace = onto

            # Define domínio
            if domains:
                NewDataProp.domain = domains if len(domains) == 1 else [And(domains)]

            # Define range como tipo primitivo
            NewDataProp.range = [data_type]

            # Define características (functional)
            if any(c.lower() == 'functional' for c in characteristics):
                NewDataProp.is_a.append(FunctionalProperty)

            # Salva a ontologia atualizada
            onto.save(file=onto_path, format='rdfxml')

        return JsonResponse({'status': 'success', 'message': 'Propriedade de dados criada com sucesso'})

    except Exception as e:
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


import json, time, re, logging
from owlready2 import get_ontology

logger = logging.getLogger(__name__)

onto = None  # Ontologia carregada antes

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import os


#################### DL QUERY #############################

# ---------- Prefixos fixos ----------
PREFIXES = """
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX o3po: <http://html.inf.ufrgs.br/home/pos/nosantos/public_html/o3po.owl#>
PREFIX o3po_merged: <http://www.semanticweb.org/nicoy/ontologies/2023/1/o3po_merged#>
PREFIX o3po_inferred: <http://www.semanticweb.org/tturb/ontologies/2025/3/o3po_inferred#>
PREFIX core: <https://spec.industrialontologies.org/ontology/core/Core/>
PREFIX core1: <https://purl.industrialontologies.org/ontology/core/Core/>
PREFIX obo: <http://purl.obolibrary.org/obo/>
"""

# ---------- Helpers ----------

def local_name_from_iri(s: str) -> str:
    if not s: return s
    s = s.strip()
    if s.startswith('<') and s.endswith('>'): 
        s = s[1:-1]
    return s.split('#')[-1].split('/')[-1]

def maybe_full(iri_like):
    if not iri_like: return iri_like
    s = iri_like.strip()
    if s.startswith('<') and s.endswith('>'):
        s = s[1:-1].strip()
    return s

def is_safe_prefixed_term(t: str) -> bool:
    if not t: return False
    if t.startswith("http://") or t.startswith("https://") or (t.startswith('<') and t.endswith('>')):
        return True
    return bool(re.match(r'^[A-Za-z_][\w\-]*:[A-Za-z_][\w\-]*$', t))

def to_sparql_term(iri_like: str) -> str:
    if not iri_like: return iri_like
    s = iri_like.strip()
    if s.startswith('http://') or s.startswith('https://'):
        return f"<{s}>"
    if s.startswith('<') and s.endswith('>'):
        return s
    return s

def expand_union(term: str, var="?focus", namespaces=("o3po", "o3po_merged", "o3po_inferred")) -> str:
    local = local_name_from_iri(term)
    unions = [f"{{ {var} {ns}:{local} }}" for ns in namespaces]
    return " UNION ".join(unions)

def resolve_entity_identifier(onto, identifier, id_type="auto"):
    """Dummy resolver de identificador."""
    if identifier.startswith("http://") or identifier.startswith("https://"):
        return identifier
    return f"http://www.semanticweb.org/nicoy/ontologies/2023/1/o3po_merged#{identifier}"

# ---------- Query builder use_case_1 ----------
def build_use_case_1_query(resolved_iri, measurement_class="o3po:ICV_annular_pressure"):
    foco_union = expand_union(resolved_iri, var="?focus") if resolved_iri else "?focus ?any ?any2"
    measurement_class_sparql = to_sparql_term(measurement_class)
    return f"""
    {PREFIXES}
    SELECT DISTINCT ?file ?icv
    WHERE {{
      ?icv rdf:type o3po:ICV .
      ?icv o3po:component_of ?focus .
      {foco_union}
      ?anular rdf:type {measurement_class_sparql} .
      ?anular core1:qualityOf ?icv .
      ?file core:isAbout ?anular .
    }}
    """

import os
import json
import logging
import unicodedata
import re
from pathlib import Path

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings

from owlready2 import get_ontology

logger = logging.getLogger(__name__)

# mantém compatibilidade se já existir no módulo
onto = globals().get('onto', None)
onto_path = globals().get('onto_path', None)


@csrf_exempt
def predefined_sparql_view(request, use_case):
    """
    View que atende use_case_1, use_case_2 e use_case_3 via varredura combinatória.
    - GET/POST /api/predefined-sparql/<use_case>/
    - Parâmetros:
        identifier (obrigatório): nome local do recurso (well, fpso, etc.) ou IRI completo
        measurement_class (opcional; default depende do use_case)
        quality_predicate (opcional)
        component_predicate (opcional)
        tag_predicate (opcional; usado no use_case_1)
    Retorno: JSON {status, results, total} ou {status, error, debug}
    """

    global onto, onto_path

    # rdflib import
    try:
        import rdflib
        URIRef = rdflib.term.URIRef
        RDF = rdflib.namespace.RDF
        RDFS = rdflib.namespace.RDFS
        Literal = rdflib.term.Literal
    except Exception as e:
        logger.exception("rdflib import failed: %s", e)
        return JsonResponse({
            'status': 'error',
            'message': 'Biblioteca "rdflib" não disponível no ambiente. Instale: pip install rdflib'
        }, status=500)

    # ---------------- helpers ----------------
    def ensure_ontology_loaded():
        global onto, onto_path
        if onto is not None:
            return onto

        possible_paths = []
        if onto_path:
            possible_paths.append(onto_path)

        possible_paths += [
            r"D:\Área de Trabalho\o3po_inferred.owl",
            "/mnt/data/o3po_inferred.owl",
            os.path.join(getattr(settings, "MEDIA_ROOT", ""), "o3po_inferred.owl"),
            os.path.join(getattr(settings, "MEDIA_ROOT", ""), "o3po_merged.owl"),
            os.path.join(getattr(settings, "MEDIA_ROOT", ""), "o3po.owl"),
        ]

        norm_paths = []
        for p in possible_paths:
            if not p:
                continue
            if str(p).startswith("file://"):
                norm_paths.append(str(p))
            else:
                norm_paths.append(os.path.abspath(str(p)))

        # dedupe preserving order
        seen = set()
        norm_paths = [p for p in norm_paths if not (p in seen or seen.add(p))]

        for p in norm_paths:
            try:
                if p.startswith("file://"):
                    onto_tmp = get_ontology(p).load()
                else:
                    if not os.path.exists(p):
                        continue
                    uri = Path(p).resolve().as_uri()
                    onto_tmp = get_ontology(uri).load()
                onto = onto_tmp
                onto_path = p
                logger.info("Loaded ontology from %s", p)
                return onto
            except Exception as e:
                logger.debug("Failed loading ontology from %s: %s", p, e, exc_info=True)

        raise RuntimeError(f"Ontology not loaded. Tried paths: {norm_paths}")

    def make_uri_candidates(local_name):
        if not local_name:
            return []

        candidates = []
        s = str(local_name).strip()
        if s.startswith("http://") or s.startswith("https://") or s.startswith("file://"):
            candidates.append(s)
            return candidates

        if ':' in s:
            prefix, name = s.split(':', 1)
            known = {
                'o3po': 'http://html.inf.ufrgs.br/home/pos/nosantos/public_html/o3po.owl#',
                'o3po_merged': 'http://www.semanticweb.org/nicoy/ontologies/2023/1/o3po_merged#',
                'o3po_inferred': 'http://www.semanticweb.org/tturb/ontologies/2025/3/o3po_inferred#',
                'core1': 'https://purl.industrialontologies.org/ontology/core/Core/',
                'core': 'http://www.ontologydesignpatterns.org/cp/owl/core#',
                'obo': 'http://purl.obolibrary.org/obo/'
            }
            if prefix in known:
                # obo:RO_0000057 -> known['obo'] + 'RO_0000057'
                candidates.append(known[prefix] + name)

        commons = [
            'http://html.inf.ufrgs.br/home/pos/nosantos/public_html/o3po.owl#',
            'http://www.semanticweb.org/nicoy/ontologies/2023/1/o3po_merged#',
            'http://www.semanticweb.org/tturb/ontologies/2025/3/o3po_inferred#',
            'https://purl.industrialontologies.org/ontology/core/Core/',
            'http://www.ontologydesignpatterns.org/cp/owl/core#',
            'http://purl.obolibrary.org/obo/'
        ]
        for ns in commons:
            candidates.append(ns + s)

        candidates.append(s)
        # dedupe preserve order
        seen = set()
        uniq = []
        for c in candidates:
            if c not in seen:
                seen.add(c)
                uniq.append(c)
        return uniq

    def strip_prefixed_local(s):
        if not s:
            return s
        s = s.strip()
        if s.startswith('<') and s.endswith('>'):
            s_inner = s[1:-1]
            return s_inner.split('#')[-1].split('/')[-1]
        if s.startswith('http://') or s.startswith('https://'):
            return s.split('#')[-1].split('/')[-1]
        if ':' in s:
            return s.split(':', 1)[1]
        return s.split('#')[-1].split('/')[-1]

    def local_name_from_iri_simple(s):
        if not s:
            return s
        s = str(s)
        if s.startswith('<') and s.endswith('>'):
            s = s[1:-1]
        return s.split('#')[-1].split('/')[-1]

    def dedupe(seq):
        seen = set(); out = []
        for x in seq:
            if x not in seen:
                seen.add(x); out.append(x)
        return out

    # --------------- parse params ----------------
    if request.method == 'GET':
        params = request.GET
        # choose default measurement_class depending on use_case
        if use_case == 'use_case_2':
            default_mc = 'o3po:ICV'
        elif use_case == 'use_case_3':
            default_mc = 'o3po:flow_rate'
        else:
            default_mc = 'o3po:ICV_annular_pressure'
        identifier = params.get('identifier')
        measurement_class = params.get('measurement_class', default_mc)
        quality_pred = params.get('quality_predicate', 'core:qualityOf')
        component_pred = params.get('component_predicate', 'o3po:component_of')
        tag_pred = params.get('tag_predicate', None)
    elif request.method == 'POST':
        try:
            payload = json.loads(request.body.decode('utf-8') or "{}")
        except Exception:
            return JsonResponse({'status': 'error', 'message': 'JSON inválido'}, status=400)
        if use_case == 'use_case_2':
            default_mc = 'o3po:ICV'
        elif use_case == 'use_case_3':
            default_mc = 'o3po:flow_rate'
        else:
            default_mc = 'o3po:ICV_annular_pressure'
        identifier = payload.get('identifier')
        measurement_class = payload.get('measurement_class', default_mc)
        quality_pred = payload.get('quality_predicate', 'core:qualityOf')
        component_pred = payload.get('component_predicate', 'o3po:component_of')
        tag_pred = payload.get('tag_predicate', None)
    else:
        return JsonResponse({'status': 'error', 'message': 'Método não permitido'}, status=405)

    if not identifier:
        return JsonResponse({'status': 'error', 'message': '"identifier" obrigatório'}, status=400)

    # ---------- ensure ontology loaded ----------
    try:
        ensure_ontology_loaded()
    except Exception as e:
        logger.exception("Ontology load failed: %s", e)
        return JsonResponse({
            'status': 'error',
            'message': 'Ontologia não carregada no processo. Veja debug.',
            'debug': {'error': str(e)}
        }, status=500)

    # ---------- build candidates ----------
    o3po_bases = [
        "http://html.inf.ufrgs.br/home/pos/nosantos/public_html/o3po.owl#",
        "http://www.semanticweb.org/nicoy/ontologies/2023/1/o3po_merged#",
        "http://www.semanticweb.org/tturb/ontologies/2025/3/o3po_inferred#"
    ]
    core_bases = [
        "https://spec.industrialontologies.org/ontology/core/Core/",
        "https://purl.industrialontologies.org/ontology/core/Core/",
        "http://www.ontologydesignpatterns.org/cp/owl/core#"
    ]
    obo_bases = [
        "http://purl.obolibrary.org/obo/"
    ]

    m_local = strip_prefixed_local(measurement_class)
    comp_local = strip_prefixed_local(component_pred)
    q_local = strip_prefixed_local(quality_pred)
    tag_local = strip_prefixed_local(tag_pred) if tag_pred else "isAbout"

    mc_candidates = []
    if measurement_class and (measurement_class.startswith('http://') or measurement_class.startswith('https://') or (measurement_class.startswith('<') and measurement_class.endswith('>'))):
        mc_val = measurement_class[1:-1] if measurement_class.startswith('<') else measurement_class
        mc_candidates.append(mc_val)
    for b in o3po_bases:
        mc_candidates.append(b + m_local)

    comp_candidates = []
    if component_pred and (component_pred.startswith('http://') or component_pred.startswith('https://') or (component_pred.startswith('<') and component_pred.endswith('>'))):
        cp = component_pred[1:-1] if component_pred.startswith('<') else component_pred
        comp_candidates.append(cp)
    for b in o3po_bases:
        comp_candidates.append(b + comp_local)

    qual_candidates = []
    if quality_pred and (quality_pred.startswith('http://') or quality_pred.startswith('https://') or (quality_pred.startswith('<') and quality_pred.endswith('>'))):
        qp = quality_pred[1:-1] if quality_pred.startswith('<') else quality_pred
        qual_candidates.append(qp)
    for b in core_bases:
        qual_candidates.append(b + q_local)

    # candidates for obo relation (RO_0000057)
    obo_candidates = []
    # if user passed obo:... in measurement_class or other fields it will be included by make_uri_candidates; but we add common obo relation explicitly
    obo_candidates.append("http://purl.obolibrary.org/obo/RO_0000057")
    obo_candidates = dedupe(obo_candidates)

    tag_candidates = []
    if tag_pred and (tag_pred.startswith('http://') or tag_pred.startswith('https://') or (tag_pred.startswith('<') and tag_pred.endswith('>'))):
        tp = tag_pred[1:-1] if tag_pred.startswith('<') else tag_pred
        tag_candidates.append(tp)
    for b in core_bases:
        tag_candidates.append(b + tag_local)

    mc_candidates = dedupe(mc_candidates)
    comp_candidates = dedupe(comp_candidates)
    qual_candidates = dedupe(qual_candidates)
    tag_candidates = dedupe(tag_candidates)

    debug_candidates = {
        'mc_candidates': mc_candidates,
        'comp_candidates': comp_candidates,
        'qual_candidates': qual_candidates,
        'tag_candidates': tag_candidates,
        'obo_candidates': obo_candidates
    }

    # ---------- graph + resolve identifier ----------
    g = onto.world.as_rdflib_graph()
    well_iri = None
    platform_iri = None

    resolver = globals().get('resolve_individual')
    try:
        if resolver:
            ind = resolver(onto, identifier)
            if ind:
                try:
                    platform_iri = URIRef(str(getattr(ind, "iri", ind)))
                except Exception:
                    platform_iri = URIRef(str(ind))
    except Exception:
        platform_iri = None

    # fallback: IRI presence
    if platform_iri is None:
        try:
            cand = URIRef(identifier)
            if (cand, None, None) in g:
                platform_iri = cand
        except Exception:
            platform_iri = None

    # fallback: rdfs:label
    if platform_iri is None:
        try:
            for s, o in g.subject_objects(RDFS.label):
                if isinstance(o, Literal) and str(o) == identifier:
                    platform_iri = s
                    break
        except Exception:
            pass

    # fallback: local-name sanitize match
    if platform_iri is None:
        san = unicodedata.normalize("NFKD", identifier).encode("ASCII", "ignore").decode()
        san = re.sub(r'[^0-9A-Za-z_]+', '_', san).strip('_')
        candidates_local = {identifier, strip_prefixed_local(identifier), san}
        try:
            for s in set(g.subjects()):
                if local_name_from_iri_simple(s) in candidates_local:
                    platform_iri = s
                    break
        except Exception:
            pass

    if platform_iri is None:
        return JsonResponse({
            'status': 'error',
            'message': f'Não foi possível resolver identifier \"{identifier}\" para um recurso na ontologia (esperado FPSO ou outro recurso).',
            'debug': debug_candidates
        }, status=404)

    # ---------- branch by use_case ----------
    found = []

    if use_case == 'use_case_1':
        import itertools
        seen = set()
        for comp_iri_str in comp_candidates:
            try:
                comp_iri = URIRef(comp_iri_str)
            except Exception:
                continue

            # iterar ICVs tanto na direção direta (?icv comp platform) quanto inversa (platform comp ?icv)
            icv_subjects = list(g.subjects(predicate=comp_iri, object=platform_iri))
            icv_objects = list(g.objects(subject=platform_iri, predicate=comp_iri))
            for icv in itertools.chain(icv_subjects, icv_objects):
                # percorrer preds de qualidade (core/core1 etc) para achar 'anular' ligados ao icv
                for qual_iri_str in qual_candidates:
                    try:
                        qual_iri = URIRef(qual_iri_str)
                    except Exception:
                        continue
                    for anular in g.subjects(predicate=qual_iri, object=icv):
                        # aqui: verificar o tipo DO 'anular' (era o bug — antes verificava o tipo do icv)
                        for mc_iri_str in mc_candidates:
                            try:
                                mc_iri = URIRef(mc_iri_str)
                            except Exception:
                                continue
                            if (anular, RDF.type, mc_iri) not in g:
                                continue
                            # se chegou aqui, 'anular' tem o tipo esperado — buscar tags que 'isAbout' esse anular
                            for tag_iri_str in tag_candidates:
                                try:
                                    tag_iri = URIRef(tag_iri_str)
                                except Exception:
                                    continue
                                for file_node in g.subjects(predicate=tag_iri, object=anular):
                                    file_uri = str(file_node)
                                    if file_uri not in seen:
                                        seen.add(file_uri)
                                        found.append({
                                            'file': file_uri,
                                            'file_name': local_name_from_iri_simple(file_uri),
                                            'icv': str(icv),
                                            'icv_name': local_name_from_iri_simple(icv)
                                        })

        if not found:
            return JsonResponse({
                'status': 'error',
                'message': 'Found 0 tags for analysis (use_case_1).',
                'debug': {
                    'resolved_entity': str(platform_iri),
                    **debug_candidates
                }
            }, status=200)

        return JsonResponse({'status': 'success', 'results': found, 'total': len(found)}, status=200)


    elif use_case == 'use_case_2':
        # (existing behavior) - unchanged
        seen = set()
        for mc_iri_str in mc_candidates:
            try:
                mc_iri = URIRef(mc_iri_str)
            except Exception:
                continue
            # iterate all instances of mc_iri
            for icv_subj, _, _ in g.triples((None, RDF.type, mc_iri)):
                # check component relation for any comp_candidate
                matched_comp = None
                for comp_iri_str in comp_candidates:
                    try:
                        comp_iri = URIRef(comp_iri_str)
                    except Exception:
                        continue
                    if (icv_subj, comp_iri, platform_iri) in g or (platform_iri, comp_iri, icv_subj) in g:
                        matched_comp = comp_iri
                        break
                if not matched_comp:
                    continue
                # for this icv_subj find subjects that have qual -> icv_subj
                for qual_iri_str in qual_candidates:
                    try:
                        qual_iri = URIRef(qual_iri_str)
                    except Exception:
                        continue
                    for tag_subj, _, _ in g.triples((None, qual_iri, icv_subj)):
                        key = f"{tag_subj}|{icv_subj}|{qual_iri}"
                        if key in seen:
                            continue
                        seen.add(key)
                        tag_iri_s = str(tag_subj)
                        icv_iri_s = str(icv_subj)
                        tag_name = local_name_from_iri_simple(tag_subj)
                        icv_name = local_name_from_iri_simple(icv_subj)
                        item = {
                            'tag_iri': tag_iri_s,
                            'tag_name': tag_name,
                            'icv_iri': icv_iri_s,
                            'icv_name': icv_name,
                            'component_predicate_used': str(matched_comp),
                            'quality_predicate_used': str(qual_iri),
                            'measurement_class_tried': str(mc_iri),
                            'file': tag_iri_s,
                            'file_name': tag_name,
                            'icv': icv_iri_s,
                            'icv_name_compat': icv_name
                        }
                        found.append(item)

        if not found:
            return JsonResponse({
                'status': 'error',
                'message': 'Found 0 tags for use_case_2.',
                'debug': {
                    'resolved_well': str(platform_iri),
                    **debug_candidates
                }
            }, status=200)

        return JsonResponse({'status': 'success', 'results': found, 'total': len(found)}, status=200)

    elif use_case == 'use_case_3':
        # Use case 3 (corrigido):
        #  - encontra poços conectados à plataforma (bidirecional)
        #  - identifica processos relacionados a cada poço (via RO_0000057 e qualquer sujeito que referencia o poço)
        #  - identifica flows (rdf:type flow_rate) que se relacionam ao processo (ambas as direções)
        #  - identifica tags que apontam para o flow (isAbout variants)
        seen = set()
        found = []

        # 1) localizar poços conectados (bidirecional) - usa connected_to candidates + comp_candidates
        connected_candidates = [ns + 'connected_to' for ns in o3po_bases]
        all_connected_candidates = dedupe(connected_candidates + comp_candidates)

        wells_found = set()
        for cc in all_connected_candidates:
            try:
                cc_iri = URIRef(cc)
            except Exception:
                continue
            # well -> connected_to -> platform
            for w in g.subjects(predicate=cc_iri, object=platform_iri):
                wells_found.add(w)
            # platform -> connected_to -> well
            for w in g.objects(subject=platform_iri, predicate=cc_iri):
                wells_found.add(w)

        if not wells_found:
            return JsonResponse({
                'status': 'error',
                'message': 'Found 0 wells connected to platform (use_case_3).',
                'debug': {
                    'resolved_platform': str(platform_iri),
                    'wells_found_count': 0,
                    'connected_candidates': all_connected_candidates,
                    **debug_candidates
                }
            }, status=200)

        # 2) construir candidatos de predicados para processCharacteristic (ambas as direções)
        proc_char_local_names = ['processCharacteristicOf', 'hasProcessCharacteristic']
        proc_char_candidates = []
        for local in proc_char_local_names:
            for base in core_bases:
                proc_char_candidates.append(base + local)
            proc_char_candidates.append('http://www.ontologydesignpatterns.org/cp/owl/core#' + local)
            proc_char_candidates.append('http://purl.obolibrary.org/obo/' + local)
            proc_char_candidates.append(local)
        proc_char_candidates = dedupe(proc_char_candidates)

        # tag predicates (isAbout variants)
        tag_local_names = ['isAbout', 'about']
        tag_preds = []
        for local in tag_local_names:
            for base in core_bases:
                tag_preds.append(base + local)
            tag_preds.append('http://www.ontologydesignpatterns.org/cp/owl/core#' + local)
            tag_preds.append(local)
        tag_preds = dedupe(tag_preds)

        # 3) para cada well, identificar processos candidatos e montar mapa well -> processes
        well_to_procs = {}
        proc_candidates_set = set()
        for well in wells_found:
            procs_for_well = set()
            # a) via obo relation (RO_0000057)
            for obo_rel in obo_candidates:
                try:
                    obo_iri = URIRef(obo_rel)
                except Exception:
                    continue
                for proc in g.subjects(predicate=obo_iri, object=well):
                    procs_for_well.add(proc)
                    proc_candidates_set.add(proc)
            # b) qualquer sujeito que referencia o well (mais permissivo)
            for s, p in g.subject_predicates(object=well):
                procs_for_well.add(s)
                proc_candidates_set.add(s)
            well_to_procs[well] = procs_for_well

        proc_candidates = list(proc_candidates_set)

        # 4) para cada poço e seu(s) processo(s), procurar flows e tags
        for well, procs in well_to_procs.items():
            well_name = local_name_from_iri_simple(well)
            for proc in procs:
                # iterar por tipos candidatos de flow (mc_candidates já preparado)
                for mc_iri_str in mc_candidates:
                    try:
                        mc_iri = URIRef(mc_iri_str)
                    except Exception:
                        continue
                    for flow_subj, _, _ in g.triples((None, RDF.type, mc_iri)):
                        # verificar ligação proc <-> flow usando proc_char_candidates (ambas as direções)
                        linked = False
                        used_proc_char = None
                        for pc in proc_char_candidates:
                            try:
                                pc_ref = URIRef(pc)
                            except Exception:
                                continue
                            if (flow_subj, pc_ref, proc) in g or (proc, pc_ref, flow_subj) in g:
                                linked = True
                                used_proc_char = pc_ref
                                break
                        if not linked:
                            continue
                        # se ligados, procurar tags que apontam para este flow (isAbout variants)
                        for isabout in tag_preds:
                            try:
                                isabout_ref = URIRef(isabout)
                            except Exception:
                                continue
                            for tag_subj, _, _ in g.triples((None, isabout_ref, flow_subj)):
                                key = f"{tag_subj}|{flow_subj}|{proc}"
                                if key in seen:
                                    continue
                                seen.add(key)
                                found.append({
                                    'tag_iri': str(tag_subj),
                                    'tag_name': local_name_from_iri_simple(tag_subj),
                                    'flow_iri': str(flow_subj),
                                    'flow_name': local_name_from_iri_simple(flow_subj),
                                    'process_iri': str(proc),
                                    'process_name': local_name_from_iri_simple(proc),
                                    'well_iri': str(well),
                                    'well_name': well_name,
                                    'predicates_used': {
                                        'processCharacteristic_candidate_used': str(used_proc_char) if used_proc_char else None,
                                        'isAbout_used': str(isabout_ref)
                                    },
                                    'measurement_class_tried': str(mc_iri)
                                })

        if not found:
            return JsonResponse({
                'status': 'error',
                'message': 'Found 0 tags for use_case_3.',
                'debug': {
                    'resolved_platform': str(platform_iri),
                    'wells_found_count': len(wells_found),
                    'wells_found': [str(x) for x in list(wells_found)[:20]],
                    'proc_candidates_count': len(proc_candidates),
                    'proc_candidates_sample': [str(x) for x in proc_candidates[:10]],
                    'mc_candidates': mc_candidates,
                    'proc_char_candidates': proc_char_candidates,
                    'tag_preds_tried': tag_preds,
                    **debug_candidates
                }
            }, status=200)

        return JsonResponse({'status': 'success', 'results': found, 'total': len(found)}, status=200)

    else:
        return JsonResponse({'status': 'error', 'message': f'Unknown use_case: {use_case}'}, status=400)