# DL Query Module - Django + React + SPARQL + HermiT

Um módulo completo para consultas DL (Description Logic) em ontologias OWL usando Django como backend, React como frontend, SPARQL para consultas semânticas e HermiT como reasoner.

## Características

- **DL Queries**: Suporte completo para consultas Description Logic
- **SPARQL**: Endpoint para consultas SPARQL nativas
- **HermiT Reasoner**: Inferências automáticas com fallback para Pellet/OWLReady2
- **Interface React**: Interface moderna e intuitiva
- **Cache Inteligente**: Cache com TTL e invalidação automática
- **Query Builder**: Construtor visual de consultas
- **Múltiplos Formatos**: Suporte a OWL, RDF, TTL, N3

## 📋 Requisitos

### Sistema
- Python 3.8+
- Java 8+ (para HermiT reasoner)
- Node.js 14+ (para desenvolvimento React)
- Redis (opcional, para cache avançado)

### Python
- Django 4.2+
- OWLReady2 0.46+
- RDFLib 7.0+
- django-cors-headers

## Instalação Rápida

### 1. Configuração Automática
```bash
# Clone ou baixe os arquivos do módulo
# Execute o script de configuração
python setup_dl_query.py
```

### 2. Configuração Manual

```bash
# Criar ambiente virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate     # Windows

# Instalar dependências
pip install -r requirements.txt

# Configurar Django
python manage.py makemigrations
python manage.py migrate

# Criar diretórios
mkdir -p media/ontologies static/js static/css templates logs
```

### 3. Configurar settings.py

Adicione ao seu `settings.py`:

```python
# Adicione ao INSTALLED_APPS
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',  # Adicionar
    'your_app_name',  # Sua app
]

# Adicione ao MIDDLEWARE
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Adicionar
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# Configurações específicas (ver django_settings_additions.py)
```

### 4. Configurar URLs

Adicione ao seu `urls.py`:

```python
from django.contrib import admin
from django.urls import path, include
from your_app import views  # Substitua pelo nome da sua app

urlpatterns = [
    path('admin/', admin.site.urls),
    # Adicione as rotas do módulo DL Query
    path('api/', include('your_app.urls')),  # Ver django_urls_config.py
]
```

## Uso

### 1. Carregar Ontologia

```python
# Via API
POST /api/load-ontology/
Content-Type: multipart/form-data
{
  "ontology_file": arquivo.owl
}
```

### 2. DL Queries

```python
# Consulta simples
POST /api/enhanced-dl-query/
{
  "query": "Person",
  "query_type": "dl_expression"
}

# Consulta complexa
POST /api/enhanced-dl-query/
{
  "query": "Student and (hasAge some Integer)",
  "query_type": "dl_expression",
  "use_reasoning": true
}
```

### 3. SPARQL Queries

```python
POST /api/sparql-query/
{
  "query": "SELECT ?person WHERE { ?person a <http://example.org/sample#Person> }"
}
```

### 4. Interface React

```jsx
import DLQueryInterface from './DLQueryInterface';

function App() {
  return (
    <div className="App">
      <DLQueryInterface />
    </div>
  );
}
```

## Exemplos de Consultas

### DL Queries

```
# Consultas básicas
Person
Student
Course

# Intersecção
Person and Student

# União  
Person or Student

# Negação
not Student

# Restrições existenciais
hasChild some Person
enrolledIn some Course

# Restrições universais
hasChild only Person

# Restrições de valor
hasAge value 25

# Cardinalidade
hasChild min 2 Person
hasChild max 5 Person
hasChild exactly 1 Person

# Consultas complexas
Person and (hasAge some Integer) and (hasChild min 1 Person)
Student and (enrolledIn some (Course and hasName value "Mathematics"))
```

### SPARQL Queries

```sparql
# Listar todas as classes
PREFIX owl: <http://www.w3.org/2002/07/owl#>
SELECT ?class WHERE {
  ?class a owl:Class
}

# Listar indivíduos e tipos
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
SELECT ?individual ?type WHERE {
  ?individual a ?type .
  FILTER(?type != owl:NamedIndividual)
}

# Propriedades de uma classe
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?property ?range WHERE {
  ?property rdfs:domain <http://example.org/sample#Person> .
  ?property rdfs:range ?range
}

# Consulta com dados
PREFIX ex: <http://example.org/sample#>
SELECT ?person ?age WHERE {
  ?person a ex:Person .
  ?person ex:hasAge ?age .
  FILTER(?age > 18)
}
```

## API Reference

### DL Query Endpoints

#### GET /api/enhanced-dl-query/
Retorna informações sobre o endpoint, construtos disponíveis e exemplos.

#### POST /api/enhanced-dl-query/
Executa consulta DL.

**Parâmetros:**
- `query` (string): Expressão DL
- `query_type` (string): "dl_expression" ou "sparql"
- `use_reasoning` (boolean): Usar inferências
- `include_inferred` (boolean): Incluir tipos inferidos
- `format` (string): "simple" ou "detailed"

### SPARQL Endpoints

#### GET /api/sparql-query/
Retorna exemplos e prefixos SPARQL.

#### POST /api/sparql-query/
Executa consulta SPARQL.

**Parâmetros:**
- `query` (string): Query SPARQL
- `format` (string): Formato de saída

### Utility Endpoints

#### GET /api/query-builder-helper/
Retorna construtos disponíveis para construção de queries.

#### POST /api/clear-dl-cache/
Limpa cache de consultas DL.

#### GET /api/dl-cache-stats/
Retorna estatísticas do cache.

## Testes

```bash
# Executar testes automáticos
python test_dl_query.py

# Testes manuais
python manage.py runserver
# Acesse http://localhost:8000/api/enhanced-dl-query/
```

## Arquitetura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React UI      │    │   Django API    │    │   OWLReady2     │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │Query Builder│ │◄──►│ │DL Processor │ │◄──►│ │ HermiT      │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ │ Reasoner    │ │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ └─────────────┘ │
│ │SPARQL Editor│ │◄──►│ │RDF Graph    │ │    │ ┌─────────────┐ │
│ └─────────────┘ │    │ └─────────────┘ │    │ │ Ontology    │ │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ │ Store       │ │
│ │Results View │ │◄──►│ │Cache Layer  │ │    │ └─────────────┘ │
│ └─────────────┘ │    │ └─────────────┘ │    └─────────────────┘
└─────────────────┘    └─────────────────┘
```

## Troubleshooting

### Java não encontrado
```bash
# Ubuntu/Debian
sudo apt-get install openjdk-11-jdk

# macOS
brew install openjdk@11

# Windows
# Baixe de https://adoptium.net/
```

### HermiT não funciona
- Verifique instalação do Java
- Use Pellet como alternativa
- Fallback para reasoner interno do OWLReady2

### Cache não funciona
- Verifique instalação do Redis
- Cache em memória será usado automaticamente

### Ontologia não carrega
- Verifique formato do arquivo (OWL, RDF, TTL)
- Verifique sintaxe da ontologia
- Veja logs para erros específicos

