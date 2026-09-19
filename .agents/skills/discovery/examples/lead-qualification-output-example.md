# Example: Lead Qualification Queue

## Scope

- Queue source: recent inbound demo and pricing emails
- Product context: engineering workflow automation
- Scoring rules: intent keywords, buyer-role relevance, company fit, spam
  domains, and urgency clues
- Freshness window: last 14 days

## Ranked Queue

| Rank | Lead or account | Category | Why now | Score or signal basis | Suggested action |
| --- | --- | --- | --- | --- | --- |
| 1 | `alex@orbitapps.io` | hot | Asked for pricing and implementation timing after team expansion | demo request, budget language, hiring signal | Reply same day with scoped pricing and a calendar link |
| 2 | `sam@vertexdata.com` | warm | Product-fit signals are good, but urgency is implied rather than stated | strong company fit, evaluator role, no clear budget | Follow up within 24 hours with a use-case note |
| 3 | `newsletter@growthforum.co` | cold | Mentions the category, but no visible buying signal | broad interest only | Add to nurture only if low-cost |
| 4 | `offers@random-seo-blast.biz` | spam | Promotional sender with no buying context | spam domain and irrelevant content | Archive and exclude |

## Queue Summary

- Hot count: 1
- Warm count: 1
- Cold count: 1
- Spam count: 1

## Attention First

- Highest-priority lead: `alex@orbitapps.io`
- Why it is urgent: combines explicit commercial intent with visible growth
- Recommended response window: under 4 business hours

## Shared Patterns

- Repeated strong signals: pricing questions, evaluator or manager-level roles,
  and evidence of active team growth
- Repeated weak or noisy signals: broad category curiosity without a defined
  problem
- Disqualifiers showing up across the queue: generic senders and non-buyer
  newsletters

## Hold Or Ignore

- Leads not worth deeper enrichment yet: the cold and spam rows
- Why they stay out of the next pass: no credible urgency and low expected
  return on additional research

## Next Actions

- Immediate follow-up: contact the top two rows with tailored next-step emails
- Nurture bucket: keep the cold row only if automated nurture is cheap
- Remove or archive: exclude the spam row from future enrichment
