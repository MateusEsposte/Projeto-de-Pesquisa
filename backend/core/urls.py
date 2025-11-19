from django.urls import path
from .views import (
    load_ontology_view,
    create_class_view,
    export_ontology_view,
    create_individual_view,
    relationship_manager_view,
    list_object_properties_view, 
    create_object_property_view,
    create_data_property_view,
    create_annotation_property_view,
    current_ontology_view,
    predefined_sparql_view,
)

urlpatterns = [
    # URLs básicas da ontologia
    path('load-ontology/', load_ontology_view, name='load_ontology'),
    path('create-class/', create_class_view, name='create_class'),
    path('export-ontology/', export_ontology_view, name='export_ontology'),
    path('create-individual/', create_individual_view, name='create_individual'),
    path('create-annotation-property/', create_annotation_property_view, name='create_annotation_property'),
    path('relationship-manager/', relationship_manager_view, name='relationship_manager'),  
    
    # URLs para propriedades
    path('api/object-properties/', list_object_properties_view, name='list_object_properties'),
    path('create_object_property/', create_object_property_view, name='create_object_property'),
    path('create_data_property/', create_data_property_view, name='create_data_property'),

    # URLs para os casos de uso
    path('api/predefined-sparql/<str:use_case>/', predefined_sparql_view, name='predefined_sparql'),
    path('api/current-ontology/', current_ontology_view, name='current_ontology'),

]