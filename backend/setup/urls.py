from django.contrib import admin
from django.conf import settings
from django.urls import path, include, re_path
from django.conf.urls.static import static
from django.views.generic import TemplateView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api-auth', include('rest_framework.urls')),
    path('', include('core.urls')),
]

urlpatterns += [
    re_path(r'^.*', TemplateView.as_view(template_name='index.html')),
]


urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)