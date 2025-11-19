from pathlib import Path
import os
import redis

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.1/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-%aa4__h0ao32!0qy+auwng55wt=&%d*_deb2m31p0e8v_ahfd6'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1']


# Application definition

INSTALLED_APPS = [
    'setup',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'core.apps.OntologyConfig',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'setup.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'build'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'setup.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.1/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# Password validation
# https://docs.djangoproject.com/en/5.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.1/topics/i18n/

LANGUAGE_CODE = 'pt-br'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.1/howto/static-files/

STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'build/static']
STATIC_ROOT = BASE_DIR / 'static'

MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

CORS_ORIGIN_ALLOW_ALL = True
CSRF_TRUSTED_ORIGINS = [      
    "http://localhost:3000",
    "http://127.0.0.1:8000",
]

CORS_ALLOW_CREDENTIALS = True 
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

O3PO_OWL_PATH = r"D:\Área de Trabalho\OntologyManager\backend\data\o3po_merged.owl"
TIMESERIES_CSV_DIR = r"D:\Área de Trabalho\OntologyManager\backend\data\timeseries"

# Default primary key field type
# https://docs.djangoproject.com/en/5.1/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Configurações para o módulo DL Query
DL_QUERY_SETTINGS = {
    # Cache settings
    'CACHE_TTL': 300,  # 5 minutos
    'ENABLE_CACHE': True,
    
    # Reasoner settings
    'DEFAULT_REASONER': 'hermit',  # hermit, pellet, owlready
    'REASONER_TIMEOUT': 30,  # segundos
    'ENABLE_REASONING': True,
    
    # SPARQL settings
    'ENABLE_SPARQL': True,
    'SPARQL_RESULT_LIMIT': 1000,
    
    # Query settings
    'MAX_QUERY_LENGTH': 10000,
    'MAX_RESULTS': 500,
    'ENABLE_QUERY_LOGGING': True,
}

# Configurações de cache (adicionar ao CACHES existente)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/1',
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        },
        'KEY_PREFIX': 'dl_query',
        'TIMEOUT': DL_QUERY_SETTINGS['CACHE_TTL'],
    }
}

# Se Redis não estiver disponível, usar cache em memória
try:
    import redis
    redis.Redis(host='127.0.0.1', port=6379, db=1).ping()
except:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'dl-query-cache',
            'TIMEOUT': DL_QUERY_SETTINGS['CACHE_TTL'],
        }
    }

# Configurações de logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
        'file': {
            'class': 'logging.FileHandler',
            'filename': 'dl_query.log',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'core': {  # nome do app
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': True,
        },
        'owlready2': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}

# Configurações de segurança para uploads
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024   # 10MB

# Allowed file extensions para ontologias
ALLOWED_ONTOLOGY_EXTENSIONS = ['.owl', '.rdf', '.ttl', '.n3', '.xml']

# Timeout para operações de reasoner (segundos)
REASONER_TIMEOUT = 30

# Configurações específicas do HermiT
HERMIT_SETTINGS = {
    'java_heap_size': '2g',
    'enable_debugging': False,
    'timeout': REASONER_TIMEOUT,
}