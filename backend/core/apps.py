# ontology/apps.py
from django.apps import AppConfig
import os

class OntologyConfig(AppConfig):
    name = "core"

    def ready(self):
        # roda reasoner automaticamente apenas no processo principal do reloader
        if os.environ.get("RUN_MAIN") == "true" or os.environ.get("WERKZEUG_RUN_MAIN") == "true" or os.environ.get("RUN_MAIN") is None:
            # import atrasado para evitar circular imports
            from .services.ontology_service import OntologyService
            from django.conf import settings
            owl_path = getattr(settings, "O3PO_OWL_PATH", "D:\Área de Trabalho\OntologyManager\backend\data\o3po_merged.owl")
            # Criar o singleton e rodar reasoner ao iniciar
            svc = OntologyService(owl_path=owl_path, run_reasoner_on_init=True)
            # opcional: guardar em local acessível, ex.: from . import loader; loader.ONT_SERVICE = svc
