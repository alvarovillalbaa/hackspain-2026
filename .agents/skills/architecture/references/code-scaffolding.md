# Code Scaffolding

Generate production-ready boilerplate for the Cloush stack: Django/DRF backend + Next.js frontend. All generated code follows Cloush conventions.

## When to Use

- Creating a new Django app (`notifications`, `analytics`, `billing`, etc.)
- Adding a new model with full CRUD API
- Generating DRF serializers and viewsets
- Creating API endpoints with permissions
- Scaffolding frontend TypeScript types and Zod schemas
- Setting up URL routing for new endpoints
- Creating test stubs for new models/endpoints

---

## 1. Django App Creation

**Step 1: Create app**
```bash
python manage.py startapp <app_name>
```

**Step 2: Generated structure**
```
<app_name>/
├── __init__.py
├── admin.py
├── apps.py
├── models.py
├── serializers.py    # create this
├── views.py
├── urls.py           # create this
├── tests.py          # expand into tests/ directory
└── migrations/
    └── __init__.py
```

**Step 3: Register in settings.py**
```python
# backend/settings.py
INSTALLED_APPS = [
    # ...
    '<app_name>',
]
```

**Step 4: Create URL routing**
```python
# <app_name>/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'<app_name>', views.<ModelName>ViewSet, basename='<model_name>')

urlpatterns = [
    path('', include(router.urls)),
]
```

**Step 5: Include in project URLs**
```python
# backend/urls.py
urlpatterns = [
    # ...
    path('api/v1/', include('<app_name>.urls')),
]
```

---

## 2. Model Generation

Always inherit from `SearchDetailModel`. This provides: `id` (UUID), `created_at`, `updated_at`, `search_vector`, `type`, `subtype`.

```python
# <app_name>/models.py
from django.db import models
from services.mixins.models import SearchDetailModel


class <ModelName>(SearchDetailModel):
    """
    <Model description>

    Inherits from SearchDetailModel:
    - id (UUIDField, primary key)
    - created_at, updated_at (TimestampedMixin)
    - search_vector (SearchMixin for PostgreSQL full-text search)
    - type, subtype (TypableMixin)
    """
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='<related_name>'
    )
    company = models.ForeignKey(
        'users.Company',
        on_delete=models.CASCADE,
        related_name='<related_name>',
        null=True,
        blank=True
    )

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=50,
        choices=[
            ('draft', 'Draft'),
            ('published', 'Published'),
            ('archived', 'Archived'),
        ],
        default='draft'
    )
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = '<app_name>_<model_name_lower>'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['company', 'is_active']),
        ]

    def __str__(self):
        return f"{self.title} ({self.user.email})"
```

### Field Type Reference

| Use Case | Django Field Type |
|----------|-------------------|
| Short text (< 255 chars) | `CharField(max_length=255)` |
| Long text | `TextField()` |
| Email | `EmailField()` |
| URL | `URLField()` |
| Integer | `IntegerField()` |
| Decimal | `DecimalField(max_digits=10, decimal_places=2)` |
| Boolean | `BooleanField(default=False)` |
| Date | `DateField()` |
| DateTime | `DateTimeField()` |
| JSON | `JSONField(default=dict)` |
| UUID | `UUIDField(default=uuid.uuid4)` |
| ForeignKey | `ForeignKey('app.Model', on_delete=...)` |
| ManyToMany | `ManyToManyField('app.Model')` |
| Choice | `CharField(choices=[...])` |

---

## 3. Serializer Generation

Always use `AccessControlSerializerMixin`. It provides: automatic permission checking, user context injection, access control enforcement.

```python
# <app_name>/serializers.py
from rest_framework import serializers
from services.mixins.serializers import AccessControlSerializerMixin
from .models import <ModelName>
from users.serializers import UserSerializer


class <ModelName>Serializer(AccessControlSerializerMixin, serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)

    class Meta:
        model = <ModelName>
        fields = [
            'id', 'user', 'user_details', 'company',
            'title', 'description', 'status', 'is_active',
            'metadata', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_title(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Title cannot be empty")
        return value.strip()

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['user'] = request.user
        return super().create(validated_data)
```

---

## 4. ViewSet Generation

Always set `permission_classes`, `permission_object_type`, and use `UnifiedAccessChecker` for object-level permissions.

```python
# <app_name>/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from services.access.checker import UnifiedAccessChecker
from .models import <ModelName>
from .serializers import <ModelName>Serializer


class <ModelName>ViewSet(viewsets.ModelViewSet):
    """
    Endpoints:
    - GET    /api/v1/<app_name>/        - List
    - POST   /api/v1/<app_name>/        - Create
    - GET    /api/v1/<app_name>/{id}/   - Retrieve
    - PUT    /api/v1/<app_name>/{id}/   - Update
    - PATCH  /api/v1/<app_name>/{id}/   - Partial update
    - DELETE /api/v1/<app_name>/{id}/   - Delete
    """
    queryset = <ModelName>.objects.all()
    serializer_class = <ModelName>Serializer
    permission_classes = [IsAuthenticated]
    permission_object_type = '<app_name>.<model_name_lower>'
    filterset_fields = ['user', 'status', 'is_active']
    search_fields = ['title', 'description']
    ordering_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if hasattr(self.queryset.model, 'company'):
            user_companies = user.companies.all()
            queryset = queryset.filter(company__in=user_companies)
        return queryset.select_related('user', 'company')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            if not UnifiedAccessChecker.can_read(request.user, obj):
                self.permission_denied(request, message="Cannot read this resource")
        elif request.method in ['PUT', 'PATCH']:
            if not UnifiedAccessChecker.can_write(request.user, obj):
                self.permission_denied(request, message="Cannot update this resource")
        elif request.method == 'DELETE':
            if not UnifiedAccessChecker.can_delete(request.user, obj):
                self.permission_denied(request, message="Cannot delete this resource")

    @action(detail=False, methods=['get'])
    def my_items(self, request):
        """Get items for current user."""
        queryset = self.get_queryset().filter(user=request.user)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
```

---

## 5. Frontend Type Generation

```typescript
// frontend/types/<model_name>.ts

export interface <ModelName> {
  id: string;
  user: string;
  userDetails?: User;
  company?: string | null;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  isActive: boolean;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Create<ModelName>Request {
  title: string;
  description?: string;
  status?: 'draft' | 'published' | 'archived';
  isActive?: boolean;
  metadata?: Record<string, any>;
}

export interface Update<ModelName>Request extends Partial<Create<ModelName>Request> {}

export interface <ModelName>ListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: <ModelName>[];
}
```

**Naming convention:** camelCase in frontend, snake_case in backend.

---

## 6. Zod Schema Generation

```typescript
// frontend/schemas/<model_name>.schema.ts
import { z } from 'zod';

export const <modelName>Schema = z.object({
  id: z.string().uuid(),
  user: z.string().uuid(),
  userDetails: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
  }).optional(),
  company: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(255),
  description: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
  isActive: z.boolean(),
  metadata: z.record(z.any()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const create<ModelName>Schema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

export const update<ModelName>Schema = create<ModelName>Schema.partial();
```

---

## 7. Migrations

```bash
python manage.py makemigrations <app_name>
python manage.py migrate <app_name>
python manage.py showmigrations <app_name>
```

---

## 8. Test Stubs

### Directory structure

```
tests/
├── unit/<app_name>/
│   ├── test_<model_name>_model.py
│   ├── test_<model_name>_serializer.py
│   └── test_<model_name>_viewset.py
└── integration/<app_name>/
    └── test_<model_name>_api.py
```

### Model test template

```python
# tests/unit/<app_name>/test_<model_name>_model.py
import pytest
from <app_name>.models import <ModelName>


@pytest.mark.unit
class Test<ModelName>Model:

    def test_create_success(self, user_factory, company_factory):
        user = user_factory()
        instance = <ModelName>.objects.create(user=user, title="Test Title")
        assert instance.id is not None
        assert instance.is_active is True

    def test_str_representation(self, user_factory):
        user = user_factory()
        instance = <ModelName>.objects.create(user=user, title="Test Title")
        assert str(instance) == f"Test Title ({user.email})"

    def test_inherits_search_detail_model(self, user_factory):
        user = user_factory()
        instance = <ModelName>.objects.create(user=user, title="Test")
        assert hasattr(instance, 'id')
        assert hasattr(instance, 'created_at')
        assert hasattr(instance, 'search_vector')
```

### API test template

```python
# tests/integration/<app_name>/test_<model_name>_api.py
import pytest
from rest_framework import status
from django.urls import reverse
from <app_name>.models import <ModelName>


@pytest.mark.integration
class Test<ModelName>API:

    def test_list(self, api_client, user_factory, <model_name>_factory):
        user = user_factory()
        api_client.force_authenticate(user=user)
        <model_name>_factory.create_batch(3, user=user)

        response = api_client.get(reverse('<app_name>:<model_name>-list'))
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 3

    def test_create_success(self, api_client, user_factory):
        user = user_factory()
        api_client.force_authenticate(user=user)
        data = {'title': 'New Item', 'description': 'Desc', 'status': 'draft'}

        response = api_client.post(reverse('<app_name>:<model_name>-list'), data, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert <ModelName>.objects.filter(title='New Item').exists()

    def test_create_validation_error(self, api_client, user_factory):
        user = user_factory()
        api_client.force_authenticate(user=user)

        response = api_client.post(
            reverse('<app_name>:<model_name>-list'), {'title': ''}, format='json'
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'title' in response.data
```

---

## File Locations

**Backend:**
- `<app_name>/models.py`
- `<app_name>/serializers.py`
- `<app_name>/views.py`
- `<app_name>/urls.py`
- `tests/unit/<app_name>/`
- `tests/integration/<app_name>/`

**Frontend:**
- `frontend/types/<model_name>.ts`
- `frontend/schemas/<model_name>.schema.ts`
- `frontend/lib/api/<app_name>.ts`

---

## Validation Checklist

**Backend:**
- [ ] Model inherits from `SearchDetailModel`
- [ ] Serializer uses `AccessControlSerializerMixin`
- [ ] ViewSet has `permission_classes` and `permission_object_type`
- [ ] URLs registered in `<app_name>/urls.py`
- [ ] `<app_name>/urls.py` included in `backend/urls.py`
- [ ] App added to `INSTALLED_APPS`
- [ ] Migrations created and applied
- [ ] Tests created (unit + integration)

**Frontend:**
- [ ] TypeScript types match backend model fields
- [ ] Zod schemas created for runtime validation
- [ ] API client methods created
- [ ] Error handling implemented
