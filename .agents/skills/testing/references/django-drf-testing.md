# Django / DRF Testing Reference

Use this reference when writing or debugging tests for Django models, Django REST Framework
serializers and views, or any pytest-based Python backend that uses Factory Boy and Faker
for test data.

For proving-layer selection, TDD-first workflow, Celery and signal testing, mock-boundary rules, and broader backend test design, also read [python-backend-tests.md](./python-backend-tests.md).

---

## Test Structure

The canonical `tests/` layout is defined in
[`../../quality-assurance/references/test-suite-layout.md`](../../quality-assurance/references/test-suite-layout.md).
Follow repo-local conventions first where they already exist.

How Django and DRF concepts map onto the canonical folders:

| Django / DRF concept | Folder |
|---|---|
| Model methods, custom managers, serializer field logic and validation, pure services | `unit/` |
| DRF views through `APIClient`, ORM persistence, permissions and authentication, Celery tasks, signals, and `django_db(transaction=True)` on-commit cases | `integration/` |
| Full user flows spanning views, tasks, and signals | `e2e/` |
| Critical-path checks around a deployment | `smoke/` |
| A pinned proof that a fixed defect has not returned, at whichever layer it lived | `regression/` |
| Factory Boy factories and shared fixtures | `factories/`, `conftest.py` |

`conftest.py` holds shared fixtures such as `api_client`, `user_factory`, and `company_factory`.

## Pytest Markers

```python
import pytest

@pytest.mark.unit          # Fast, no DB
@pytest.mark.integration   # Requires DB/external services
@pytest.mark.e2e           # Full workflow
@pytest.mark.smoke         # High-level sanity
@pytest.mark.regression    # Pinned proof a defect has not returned
@pytest.mark.adversarial   # Abuse of own interfaces; gated, deselected by default
@pytest.mark.evals         # Wraps an externally defined eval suite
@pytest.mark.tmp           # Scratch; never collected in CI
@pytest.mark.tier3         # Declared data tier (tier1 through tier5)
@pytest.mark.slow          # Slow-running tests
@pytest.mark.asyncio       # Async tests (auto-detected)
```

Run commands:

```bash
pytest -m unit              # Fast, isolated tests
pytest -m integration       # Tests with DB/external calls
pytest -m e2e               # Full workflow tests
pytest -m smoke             # High-level sanity tests
pytest -n auto              # Parallel execution (all CPU cores)
pytest --cov=. --cov-report=html  # With coverage
```

---

## Testing Django Models

```python
import pytest
from users.models import User, Company

@pytest.mark.unit
def test_user_creation(db):
    user = User.objects.create(
        email='test@example.com',
        first_name='Test',
        last_name='User'
    )
    assert user.id is not None
    assert user.email == 'test@example.com'
    assert user.full_name == 'Test User'

@pytest.mark.unit
def test_user_str_representation(db):
    user = User.objects.create(
        email='test@example.com',
        first_name='Test',
        last_name='User'
    )
    assert str(user) == 'Test User'
```

**Common model test scenarios:**
- Creation with valid data
- Validation errors for invalid data
- Unique constraint enforcement (`pytest.raises(IntegrityError)`)
- Foreign key and many-to-many relationships
- Custom model methods and properties
- Full-text search (`SearchDetailModel.search_vector`)
- Timestamps (`created_at`, `updated_at`)

---

## Testing DRF Serializers

```python
import pytest
from rest_framework.test import APIRequestFactory
from users.serializers import CompanySerializer

@pytest.mark.unit
def test_company_serializer_valid_data(user_factory):
    user = user_factory()
    factory = APIRequestFactory()
    request = factory.get('/')
    request.user = user

    data = {'name': 'Test Company', 'email': 'test@company.com'}
    serializer = CompanySerializer(data=data, context={'request': request})
    assert serializer.is_valid()
    company = serializer.save()
    assert company.name == 'Test Company'

@pytest.mark.unit
def test_company_serializer_invalid_email():
    data = {'name': 'Test Company', 'email': 'invalid-email'}
    serializer = CompanySerializer(data=data)
    assert not serializer.is_valid()
    assert 'email' in serializer.errors

@pytest.mark.unit
def test_company_serializer_read_only_fields(company_factory):
    company = company_factory()
    data = {'name': 'Updated Name', 'id': 'hacked-id', 'created_at': '2020-01-01'}
    serializer = CompanySerializer(company, data=data, partial=True)
    assert serializer.is_valid()
    updated = serializer.save()
    assert updated.name == 'Updated Name'
    assert str(updated.id) != 'hacked-id'
```

**Common serializer test scenarios:**
- Valid data serialization and deserialization
- Required fields and validation errors
- Read-only field protection
- Nested serializers
- Custom `validate_<field>` methods
- Field transformations
- Context usage (`request.user`, company scope, etc.)

---

## Testing DRF Views / ViewSets

```python
import pytest
from rest_framework.test import APIClient
from rest_framework import status
from users.models import Company, CompanyUser

@pytest.mark.integration
def test_list_companies_authenticated(api_client, user_factory, company_factory):
    user = user_factory()
    company = company_factory()
    CompanyUser.objects.create(user=user, company=company, role='member')
    api_client.force_authenticate(user=user)

    response = api_client.get('/api/v1/companies/')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) > 0

@pytest.mark.integration
def test_list_companies_unauthenticated(api_client):
    response = api_client.get('/api/v1/companies/')
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.integration
def test_create_company_valid_data(api_client, user_factory):
    user = user_factory()
    api_client.force_authenticate(user=user)

    data = {'name': 'New Company', 'email': 'new@company.com'}
    response = api_client.post('/api/v1/companies/', data, format='json')

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['name'] == 'New Company'
    assert Company.objects.filter(name='New Company').exists()

@pytest.mark.integration
def test_update_company_permissions(api_client, user_factory, company_factory):
    user = user_factory()
    company = company_factory()
    CompanyUser.objects.create(user=user, company=company, role='member')  # Not admin
    api_client.force_authenticate(user=user)

    response = api_client.patch(f'/api/v1/companies/{company.id}/', {'name': 'X'}, format='json')
    assert response.status_code == status.HTTP_403_FORBIDDEN
```

**Coverage checklist for view tests:**
- List (200 OK, pagination)
- Retrieve (200 OK, 404 Not Found)
- Create (201 Created, 400 Bad Request)
- Update (200 OK, 403 Forbidden, 404 Not Found)
- Delete (204 No Content, 403 Forbidden, 404 Not Found)
- Authentication boundary (401 Unauthorized)
- Permission boundary (403 Forbidden)
- Query parameters: filtering, sorting, pagination

---

## Factory Boy + Faker Fixtures

### Factory definition

```python
# tests/factories/user_factory.py
import factory
from faker import Faker
from users.models import User, CompanyUser

fake = Faker()

class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    email = factory.LazyAttribute(lambda _: fake.email())
    first_name = factory.LazyAttribute(lambda _: fake.first_name())
    last_name = factory.LazyAttribute(lambda _: fake.last_name())
    phone_number = factory.LazyAttribute(lambda _: fake.phone_number())

    @factory.post_generation
    def companies(self, create, extracted, **kwargs):
        if not create:
            return
        if extracted:
            for company in extracted:
                CompanyUser.objects.create(user=self, company=company, role='member')
```

### Fixture registration in conftest.py

```python
@pytest.fixture
def user_factory(db):
    return UserFactory

@pytest.fixture
def company_factory(db):
    return CompanyFactory

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture(autouse=True)
def enable_celery_eager(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
```

### Using factories in tests

```python
def test_something(user_factory, company_factory):
    user = user_factory()                              # Random data
    company = company_factory(name='Specific Name')    # Override a field
    user2 = user_factory(companies=[company])          # Post-generation hook
```

### Generating realistic Faker data

```python
from faker import Faker
fake = Faker()

def generate_realistic_user_data():
    return {
        'email': fake.email(),
        'first_name': fake.first_name(),
        'last_name': fake.last_name(),
        'phone_number': fake.phone_number(),
        'address': {
            'street': fake.street_address(),
            'city': fake.city(),
            'state': fake.state(),
            'zip': fake.zipcode()
        },
        'company_name': fake.company(),
        'job_title': fake.job()
    }
```

---

## Debugging Django/DRF Test Failures

### Workflow

1. **Read the assertion:** What was expected vs. what was returned?
2. **Correlate with recent commits:** What touched the failing module?
3. **Identify the failure pattern** (see below).
4. **Fix the root cause**, not just the test data.

```bash
# Find commits that modified the endpoint
git log --since="1 week ago" --oneline -- jobs/views.py jobs/serializers.py

# Show detailed changes
git log -p --since="1 week ago" -- jobs/serializers.py
```

### Common failure patterns

**Pattern: Serializer field added (now required)**

```
# 400 instead of 201
FAILED test_create_project - AssertionError: assert 400 == 201
```

A new required field was added to the serializer. Fix: add the field to test data.

**Pattern: Model migration missing**

```
django.db.utils.OperationalError: no such column: jobs_project.status
```

A field was added to the model but the migration was not created or applied.

```bash
python manage.py makemigrations
python manage.py migrate
```

**Pattern: Permission check added**

```
# 403 instead of 200
FAILED test_list_projects - assert 403 == 200
```

A new permission class was added to the view. Fix: update the test to create a user with the correct role.

```python
# Before
user = user_factory()

# After — user needs admin role
CompanyUser.objects.create(user=user, company=company, role='admin')
```

**Pattern: Mock configuration stale**

```
AttributeError: Mock object has no attribute 'new_method'
```

The real service grew a new method call that the mock does not satisfy. Fix: update the mock.

```python
@patch('services.ai.some_service')
def test_something(mock_service):
    mock_service.return_value.new_method.return_value = 'expected'
```

---

## Test Templates

### Model test suite

```python
import pytest
from <app>.models import <Model>

@pytest.mark.unit
class Test<Model>Model:
    def test_create_valid(self, db):
        obj = <Model>.objects.create(...)
        assert obj.id is not None

    def test_str_representation(self, db):
        obj = <Model>.objects.create(...)
        assert str(obj) == 'expected_value'

    def test_unique_constraint(self, db):
        <Model>.objects.create(field='value')
        with pytest.raises(IntegrityError):
            <Model>.objects.create(field='value')

    def test_foreign_key_relationship(self, db):
        pass  # verify related object access
```

### Serializer test suite

```python
import pytest
from rest_framework.test import APIRequestFactory
from <app>.serializers import <Serializer>

@pytest.mark.unit
class Test<Serializer>:
    def test_serialize_valid_data(self):
        serializer = <Serializer>(data={...})
        assert serializer.is_valid()
        obj = serializer.save()

    def test_validation_errors(self):
        serializer = <Serializer>(data={...})  # invalid data
        assert not serializer.is_valid()
        assert 'field_name' in serializer.errors

    def test_read_only_fields(self):
        pass  # verify read-only fields cannot be overwritten
```

### API endpoint test suite

```python
import pytest
from rest_framework import status

@pytest.mark.integration
class Test<Model>API:
    def test_list_authenticated(self, api_client, user_factory):
        user = user_factory()
        api_client.force_authenticate(user=user)
        response = api_client.get('/api/v1/<endpoint>/')
        assert response.status_code == status.HTTP_200_OK

    def test_list_unauthenticated(self, api_client):
        response = api_client.get('/api/v1/<endpoint>/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_valid_data(self, api_client, user_factory):
        user = user_factory()
        api_client.force_authenticate(user=user)
        response = api_client.post('/api/v1/<endpoint>/', {...}, format='json')
        assert response.status_code == status.HTTP_201_CREATED

    def test_create_invalid_data(self, api_client, user_factory):
        user = user_factory()
        api_client.force_authenticate(user=user)
        response = api_client.post('/api/v1/<endpoint>/', {}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
```

---

## Best Practices

### Naming and organization
- Name tests: `test_<action>_<scenario>_<expected_result>`
- Group related tests in classes
- Use the correct marker (`unit` vs `integration`) — mixing them slows the fast suite

### Data
- Use factories for model creation; use `Faker` for realistic field values
- Create the minimum data the test needs
- pytest's `db` fixture handles teardown automatically

### Assertions
- Assert both the HTTP status and the persisted state (for integration tests)
- Check positive and negative cases
- Verify side effects: rows written, signals sent, Celery tasks enqueued

### Mocking
- Mock external service boundaries (OpenAI, AWS, third-party APIs)
- Do not mock internal Django code in integration tests — that defeats their purpose
- Use `@patch` with specific paths; keep mocks close to the test that needs them
