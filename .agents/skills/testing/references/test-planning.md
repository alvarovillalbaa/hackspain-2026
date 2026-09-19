# Test Planning and Documentation

Use this reference when taking feature artifacts (PRD, technical breakdown, implementation plan) and generating comprehensive test strategy, task breakdown, and quality assurance documentation — especially for GitHub project management.

## Input Requirements

Before test planning, gather:

1. **Feature PRD**: `/docs/ways-of-work/plan/{epic-name}/{feature-name}.md`
2. **Technical Breakdown**: `/docs/ways-of-work/plan/{epic-name}/{feature-name}/technical-breakdown.md`
3. **Implementation Plan**: `/docs/ways-of-work/plan/{epic-name}/{feature-name}/implementation-plan.md`
4. **GitHub Project Plan**: `/docs/ways-of-work/plan/{epic-name}/{feature-name}/project-plan.md`

## Output Documents

| Document | Path |
|----------|------|
| Test Strategy | `{epic}/{feature}/test-strategy.md` |
| Test Issues Checklist | `{epic}/{feature}/test-issues-checklist.md` |
| Quality Assurance Plan | `{epic}/{feature}/qa-plan.md` |

---

## Quality Standards Framework

### ISTQB Framework Application

Apply these test process activities in sequence: planning → monitoring → analysis → design → implementation → execution → completion.

**Test Design Techniques**

| Technique | When to Apply |
|-----------|---------------|
| Equivalence Partitioning | Input domain has distinct valid/invalid partitions |
| Boundary Value Analysis | Numeric ranges, string lengths, collection limits |
| Decision Table Testing | Complex business rules with multiple conditions |
| State Transition Testing | System has distinct modes or stateful workflows |
| Experience-Based (exploratory) | New or poorly-specified areas; error guessing |

**Test Types Coverage Matrix**

- **Functional**: Feature behavior validation — acceptance criteria, happy paths, error paths
- **Non-Functional**: Performance, usability, security, accessibility
- **Structural**: Code coverage, architecture validation
- **Change-Related**: Regression and confirmation testing after fixes

### ISO 25010 Quality Characteristics

Assign Critical / High / Medium / Low priority per feature:

| Characteristic | Sub-characteristics | Focus Area |
|----------------|---------------------|------------|
| Functional Suitability | Completeness, correctness, appropriateness | Core feature behavior |
| Performance Efficiency | Time behavior, resource utilization, capacity | Load and throughput |
| Compatibility | Co-existence, interoperability | Integration points |
| Usability | Learnability, operability, accessibility, aesthetics | UX and a11y |
| Reliability | Fault tolerance, recoverability, availability | Error handling, uptime |
| Security | Confidentiality, integrity, authentication, authorization | Auth and data protection |
| Maintainability | Modularity, reusability, testability | Code structure |
| Portability | Adaptability, installability | Cross-environment behavior |

---

## Test Strategy Structure

### 1. Overview

- **Testing Scope**: Features and components in scope
- **Quality Objectives**: Measurable goals and success criteria
- **Risk Assessment**: Identified risks and mitigation strategies
- **Test Approach**: Methodology and framework selection (ISTQB techniques, test types)

### 2. ISTQB Technique Selection

Document which techniques apply and why — reference the table above.

### 3. ISO 25010 Priority Matrix

Rate each quality characteristic as Critical / High / Medium / Low for the feature being planned.

### 4. Test Environment and Data Strategy

- **Environment Requirements**: Infra, software, network configs
- **Test Data Management**: Data preparation, privacy, seeding strategy
- **Tool Selection**: Framework and automation platform choices
- **CI/CD Integration**: Where each test level runs in the pipeline

---

## Test Issues Checklist

### Test Level Issues

- [ ] **Test Strategy Issue**: Overall approach and quality validation plan
- [ ] **Unit Test Issues**: Component-level for each implementation task
- [ ] **Integration Test Issues**: Interface and component interaction
- [ ] **End-to-End Test Issues**: Complete user workflows (Playwright)
- [ ] **Performance Test Issues**: Non-functional requirement validation
- [ ] **Security Test Issues**: Vulnerabilities and security requirements
- [ ] **Accessibility Test Issues**: WCAG compliance and inclusive design
- [ ] **Regression Test Issues**: Change impact and existing functionality

### Test Type Prioritization

- [ ] **Functional Priority**: Critical user paths and core business logic
- [ ] **Non-Functional Priority**: Performance, security, usability requirements
- [ ] **Structural Priority**: Coverage targets and architecture validation
- [ ] **Change-Related Priority**: Risk-based regression scope

### Dependencies

- [ ] **Implementation Dependencies**: Tests blocked by specific dev tasks
- [ ] **Environment Dependencies**: Test environment and data requirements
- [ ] **Tool Dependencies**: Framework and automation setup
- [ ] **Cross-Team Dependencies**: External systems or teams

### Coverage Targets

- [ ] Code coverage: >80% line, >90% branch for critical paths
- [ ] Functional coverage: 100% acceptance criteria validated
- [ ] Risk coverage: 100% high-risk scenarios covered
- [ ] Quality characteristics: Validation approach defined for all applicable ISO 25010 dimensions

---

## Task Breakdown

### Estimation Guidelines

| Test Level | Story Points |
|-----------|--------------|
| Unit test tasks | 0.5–1 per component |
| Integration test tasks | 1–2 per interface |
| E2E test tasks | 2–3 per user workflow |
| Performance test tasks | 3–5 per requirement |
| Security test tasks | 2–4 per requirement |

### Sequencing

- [ ] **Sequential dependencies**: Tests that must be implemented in order
- [ ] **Parallel development**: Tests that can be developed simultaneously
- [ ] **Critical path**: Testing tasks on the delivery critical path
- [ ] **Resource allocation**: Assignment based on skills and capacity

---

## Quality Gates and Checkpoints

### Entry Criteria (before testing begins)

- Implementation tasks completed per phase
- Unit tests passing
- Code review approved
- Test environment provisioned and seeded

### Exit Criteria (before phase completion)

- All test types executed with >95% pass rate
- No Critical or High severity open defects
- Performance benchmarks met
- Security validation passed
- Accessibility standards verified

### Escalation

Define the process for addressing quality failures: who is notified, what is blocked, and when to defer vs. halt delivery.

---

## GitHub Issue Templates

### Test Strategy Issue

```markdown
# Test Strategy: {Feature Name}

## Test Strategy Overview
{Summary of testing approach based on ISTQB and ISO 25010}

## ISTQB Framework Application

**Test Design Techniques Used:**
- [ ] Equivalence Partitioning
- [ ] Boundary Value Analysis
- [ ] Decision Table Testing
- [ ] State Transition Testing
- [ ] Experience-Based Testing

**Test Types Coverage:**
- [ ] Functional Testing
- [ ] Non-Functional Testing
- [ ] Structural Testing
- [ ] Change-Related Testing (Regression)

## ISO 25010 Quality Characteristics

**Priority Assessment:**
- [ ] Functional Suitability: {Critical/High/Medium/Low}
- [ ] Performance Efficiency: {Critical/High/Medium/Low}
- [ ] Compatibility: {Critical/High/Medium/Low}
- [ ] Usability: {Critical/High/Medium/Low}
- [ ] Reliability: {Critical/High/Medium/Low}
- [ ] Security: {Critical/High/Medium/Low}
- [ ] Maintainability: {Critical/High/Medium/Low}
- [ ] Portability: {Critical/High/Medium/Low}

## Quality Gates
- [ ] Entry criteria defined
- [ ] Exit criteria established
- [ ] Quality thresholds documented

## Labels
`test-strategy`, `istqb`, `iso25010`, `quality-gates`

## Estimate
{Strategic planning effort: 2–3 story points}
```

### Playwright Test Implementation Issue

```markdown
# Playwright Tests: {Story/Component Name}

## Test Implementation Scope
{Specific user story or component being tested}

## ISTQB Test Case Design
**Test Design Technique**: {Selected ISTQB technique}
**Test Type**: {Functional/Non-Functional/Structural/Change-Related}

## Test Cases to Implement

**Functional Tests:**
- [ ] Happy path scenarios
- [ ] Error handling validation
- [ ] Boundary value testing
- [ ] Input validation testing

**Non-Functional Tests:**
- [ ] Performance testing (response time < {threshold})
- [ ] Accessibility testing (WCAG compliance)
- [ ] Cross-browser compatibility
- [ ] Mobile responsiveness

## Playwright Implementation Tasks
- [ ] Page Object Model development
- [ ] Test fixture setup
- [ ] Test data management
- [ ] Test case implementation
- [ ] Visual regression tests
- [ ] CI/CD integration

## Acceptance Criteria
- [ ] All test cases pass
- [ ] Code coverage targets met (>80%)
- [ ] Performance thresholds validated
- [ ] Accessibility standards verified

## Labels
`playwright`, `e2e-test`, `quality-validation`

## Estimate
{Test implementation effort: 2–5 story points}
```

### Quality Assurance Issue

```markdown
# Quality Assurance: {Feature Name}

## Quality Validation Scope
{Overall quality validation for feature/epic}

## ISO 25010 Quality Assessment
- [ ] Functional Suitability: Completeness, correctness, appropriateness
- [ ] Performance Efficiency: Time behavior, resource utilization, capacity
- [ ] Usability: Interface aesthetics, accessibility, learnability, operability
- [ ] Security: Confidentiality, integrity, authentication, authorization
- [ ] Reliability: Fault tolerance, recovery, availability
- [ ] Compatibility: Browser, device, integration compatibility
- [ ] Maintainability: Code quality, modularity, testability
- [ ] Portability: Environment adaptability, installation procedures

## Quality Gates Validation

**Entry Criteria:**
- [ ] All implementation tasks completed
- [ ] Unit tests passing
- [ ] Code review approved

**Exit Criteria:**
- [ ] All test types completed with >95% pass rate
- [ ] No critical/high severity defects
- [ ] Performance benchmarks met
- [ ] Security validation passed

## Quality Metrics
- [ ] Test coverage: {target}%
- [ ] Defect density: <{threshold} defects/KLOC
- [ ] Performance: Response time <{threshold}ms
- [ ] Accessibility: WCAG {level} compliance
- [ ] Security: Zero critical vulnerabilities

## Labels
`quality-assurance`, `iso25010`, `quality-gates`

## Estimate
{Quality validation effort: 3–5 story points}
```

---

## GitHub Issue Labels

| Label | Purpose |
|-------|---------|
| `unit-test` | Component-level test work |
| `integration-test` | Interface and interaction testing |
| `e2e-test` | End-to-end user workflow testing |
| `performance-test` | Non-functional performance requirements |
| `security-test` | Security and vulnerability testing |
| `quality-gate` | Gate checkpoint issue |
| `iso25010` | ISO quality characteristics work |
| `istqb-technique` | ISTQB technique application |
| `risk-based` | Risk-driven test selection |
| `test-critical` / `test-high` / `test-medium` / `test-low` | Priority tiers |
| `frontend-test` / `backend-test` / `api-test` / `database-test` | Component scope |

---

## Success Metrics

### Test Coverage

- Code coverage: >80% line, >90% branch on critical paths
- Functional coverage: 100% acceptance criteria validated
- Risk coverage: 100% high-risk scenarios addressed
- Quality characteristics: All applicable ISO 25010 dimensions have a validation approach

### Quality Validation

- Defect detection rate: >95% of defects found before production
- Test automation coverage: >90%
- Quality gate compliance: 100% before release
- Risk mitigation: 100% identified risks have mitigation strategies

### Process Efficiency

- Test planning time: <2 hours to create a comprehensive test strategy
- Test implementation speed: <1 day per story point
- Quality feedback time: <2 hours from test completion to quality assessment
- Documentation completeness: 100% of test issues have complete template information
