# ontology/services/ontology_service.py
from owlready2 import get_ontology, sync_reasoner, default_world
import re
import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta


class OntologyService:
    def __init__(self, owl_path="D:\Área de Trabalho\OntologyManager\backend\data\o3po_merged.owl", run_reasoner_on_init=False):
        """
        Por padrão, não rodar o reasoner aqui (run_reasoner_on_init=False).
        Em dev com runserver, executar no import causa execuções duplicadas.
        Use run_reasoner() explicitamente ou use AppConfig.ready() para ativar.
        """
        self.owl_path = owl_path
        self.onto = None
        self._inferred = False

        # carregar ontologia se arquivo existir
        if os.path.exists(owl_path):
            print(f"[OntologyService] Loading ontology from {owl_path} ...")
            self.onto = get_ontology(f"file://{owl_path}").load()
            if run_reasoner_on_init:
                # proteger contra execução duplicada em runserver/reloader:
                if os.environ.get("RUN_MAIN") == "true" or os.environ.get("WERKZEUG_RUN_MAIN") == "true" or os.environ.get("RUN_MAIN") is None:
                    # a última parte (is None) permite execução quando RUN_MAIN não estiver setado (ex: produção)
                    try:
                        print("[OntologyService] Running reasoner (HermiT) on init. This may take a while...")
                        self.run_reasoner()
                        print("[OntologyService] Reasoner finished.")
                    except Exception as e:
                        print(f"[OntologyService] Warning: reasoner failed at init: {e}")
        else:
            print(f"[OntologyService] WARNING: OWL file not found at {owl_path}. Ontology not loaded.")

    def run_reasoner(self, infer_property_values: bool = True, infer_data_property_values: bool = False):
        """
        Executa o reasoner de forma robusta:
         - ignora se já rodou (idempotente)
         - tenta chamar sync_reasoner com ou sem o kwarg 'infer_data_property_values'
        """
        if self._inferred:
            print("[OntologyService] Reasoner already executed; skipping.")
            return

        try:
            # versão que tenta passar ambos (algumas versões aceitam)
            sync_reasoner(infer_property_values=infer_property_values,
                          infer_data_property_values=infer_data_property_values)
        except TypeError:
            # fallback: algumas versões do owlready2/ HermiT não aceitam infer_data_property_values
            sync_reasoner(infer_property_values=infer_property_values)
        self._inferred = True

    def as_rdflib(self):
        return default_world.as_rdflib_graph()

    def _local_name(self, uri_str: str) -> str:
        if not uri_str:
            return ""
        m = re.search(r'[#/](?P<local>[^#/]+)$', uri_str)
        return m.group("local") if m else uri_str

    def get_icv_annular_pressure_tags_for_well(self, well_local_name: str):
        if self.onto is None:
            raise RuntimeError("Ontology not loaded. Set correct O3PO_OWL_PATH and load the ontology.")
        sparql = f"""
        PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX o3po: <http://html.inf.ufrgs.br/home/pos/nosantos/public_html/o3po.owl#>
        PREFIX o3po_merged: <http://www.semanticweb.org/nicoy/ontologies/2023/1/o3po_merged#>
        PREFIX core1: <https://purl.industrialontologies.org/ontology/core/Core/>

        SELECT DISTINCT ?suj ?label WHERE {{
          ?icv rdf:type o3po:ICV .
          ?icv o3po:component_of o3po_merged:{well_local_name} .
          ?anular rdf:type o3po:ICV_annular_pressure .
          ?anular core1:qualityOf ?icv .
          ?suj core1:isAbout ?anular .
          OPTIONAL {{ ?suj rdfs:label ?label . }}
        }}
        """
        g = self.as_rdflib()
        qres = g.query(sparql)

        tags = []
        for row in qres:
            raw = row[0]
            label = str(row[1]) if len(row) > 1 and row[1] is not None else None

            if hasattr(raw, "toPython"):
                try:
                    raw_py = raw.toPython()
                except:
                    raw_py = str(raw)
            else:
                raw_py = str(raw)

            if isinstance(raw_py, str) and (raw_py.startswith("http://") or raw_py.startswith("https://")):
                local = self._local_name(raw_py)
                tag_value = local
            else:
                tag_value = raw_py

            tags.append({
                "raw": str(raw),
                "tag": tag_value,
                "label": label
            })
        return tags

    # timeseries helpers (mesmo que você já tem)
    def _csv_path_for_tag(self, tag):
        csv_dir = os.environ.get("TIMESERIES_CSV_DIR", "/mnt/data/timeseries")
        return os.path.join(csv_dir, f"{tag}.csv")

    def get_timeseries_for_tag(self, tag, start=None, end=None, max_points=500):
        path = self._csv_path_for_tag(tag)
        if os.path.exists(path):
            df = pd.read_csv(path, parse_dates=["timestamp"])
            if start:
                df = df[df["timestamp"] >= pd.to_datetime(start)]
            if end:
                df = df[df["timestamp"] <= pd.to_datetime(end)]
            if len(df) > max_points:
                df = df.iloc[-max_points:]
            timestamps = [ts.isoformat() for ts in df["timestamp"].tolist()]
            values = [float(v) if not pd.isna(v) else None for v in df["value"].tolist()]
            return {"tag": tag, "simulated": False, "timestamps": timestamps, "values": values}
        else:
            now = datetime.utcnow()
            hours = 48
            timestamps = [(now - timedelta(hours=(hours - 1 - i))).isoformat() + "Z" for i in range(hours)]
            x = np.arange(hours)
            values = (50 + 5*np.sin(2*np.pi*x/24) + 0.5*x + np.random.normal(scale=0.7, size=hours)).tolist()
            values = [float(round(v, 3)) for v in values]
            return {"tag": tag, "simulated": True, "timestamps": timestamps, "values": values}
