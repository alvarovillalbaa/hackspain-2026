# Prompt Engineering Patterns

Specific prompt techniques with examples. Organized by technique family. Prompting families form a toolbox — choose by task type, not by popularity.

## Full Taxonomy by Family

### Zero-Shot Family
| Technique | When to use |
|-----------|-------------|
| **Zero-shot** | Simple, well-defined tasks |
| **Role / Persona** | Need expertise or specific perspective |
| **Emotion Prompting** | Increase effort on high-stakes outputs ("This is critical…") |
| **Style Injection** | Constrain tone/register ("Respond in bullet points, ≤100 words") |
| **S2A (System-to-Agent)** | Reframe system prompt as agent instructions |
| **SimToM** | Perspective-taking: "What does X know/believe at this moment?" |
| **RaR (Rephrase and Respond)** | "Rephrase the question in your own words before answering" |
| **RE2 (Re-reading)** | "Read the problem twice before answering" — reduces careless errors |
| **Self-Ask** | "What sub-questions do you need to answer this?" |

### Few-Shot Family
| Technique | When to use |
|-----------|-------------|
| **Few-shot** | Consistent format needed; domain-specific patterns |
| **Example Generation** | Ask model to generate diverse examples before the task |
| **Ordering** | Recency matters: most relevant example should be last |
| **KNN Exemplar Selection** | Retrieve nearest-neighbor examples from a pool |
| **Vote-K** | Select maximally diverse examples via coverage voting |
| **Prompt Mining** | Extract implicit templates from task demonstrations |

### Thought Generation Family
| Technique | When to use |
|-----------|-------------|
| **Chain-of-Thought** | "Think step by step" — reasoning, math, multi-step |
| **Zero-Shot CoT** | Same effect without examples: "Let's think step by step" |
| **Analogical Prompting** | "Recall a similar problem and apply the same approach" |
| **Step-Back** | Abstract the question first, then answer the specific |
| **Thread-of-Thought** | Structured thought thread with numbered steps |
| **Table CoT** | Intermediate reasoning as a structured table |
| **Active Prompt** | Select highest-uncertainty examples for CoT annotation |
| **Auto-CoT** | Auto-generate CoT demonstrations from a question set |
| **Memory-of-Thought** | Retrieve relevant past reasoning before generating |
| **Uncertainty-Routed CoT** | Use greedy decode normally; route to CoT only when uncertain |

### Ensembling Family
| Technique | When to use |
|-----------|-------------|
| **Self-Consistency** | High-stakes decisions — run N times, majority-vote |
| **Universal Self-Consistency** | Select most consistent answer across formats |
| **Meta-CoT** | Ensemble multiple chains before final answer |
| **Prompt Paraphrasing** | Same question phrased N ways, aggregate |
| **MMI Variants** | Minimum Bayes risk decoding; diverse sampling |

### Self-Criticism Family
| Technique | When to use |
|-----------|-------------|
| **Self-Verification** | Model verifies its own answer for logical consistency |
| **Calibration** | Ask model to express confidence before committing |
| **Self-Refinement** | "Now improve your answer based on this criterion…" |
| **Reverse CoT** | Generate question from answer; verify it matches original |
| **Cumulative Reasoning** | Accumulate and verify partial conclusions before final answer |

### Decomposition Family
| Technique | When to use |
|-----------|-------------|
| **Least-to-Most** | Break into simplest sub-problem first; solve in order |
| **Plan-and-Solve** | Plan the solution before executing any step |
| **Program-of-Thought** | Generate code to compute the answer; execute and use result |
| **Tree of Thoughts** | Explore branching solution paths; prune bad branches |
| **Skeleton-of-Thought** | Generate outline; fill in sections in parallel |
| **Recursive Thought** | Recursively decompose each sub-problem until trivial |

---

## Classic Patterns Index (with full examples)

1. [Zero-Shot Prompting](#1-zero-shot-prompting)
2. [Few-Shot Prompting](#2-few-shot-prompting)
3. [Chain-of-Thought (CoT)](#3-chain-of-thought-cot)
4. [Role Prompting](#4-role-prompting)
5. [Structured Output](#5-structured-output)
6. [Self-Consistency](#6-self-consistency)
7. [ReAct (Reasoning + Acting)](#7-react-reasoning--acting)
8. [Tree of Thoughts](#8-tree-of-thoughts)
9. [Retrieval-Augmented Generation](#9-retrieval-augmented-generation)
10. [Meta-Prompting](#10-meta-prompting)
11. [Advanced Compact Reference](#11-advanced-compact-reference)

---
10. [Meta-Prompting](#10-meta-prompting)

---

## 1. Zero-Shot Prompting

**When to use:** Simple, well-defined tasks where the model has sufficient training knowledge.

**Pattern:**
```
[Task instruction]
[Input]
```

**Example:**

Input:
```
Classify the following customer review as positive, negative, or neutral.

Review: "The shipping was fast but the product quality was disappointing."
```

Expected Output:
```
negative
```

**Best practices:**
- Be explicit about output format
- Use clear, unambiguous verbs (classify, extract, summarize)
- Specify constraints (word limits, format requirements)

**When to avoid:**
- Tasks requiring specific formatting the model hasn't seen
- Domain-specific tasks requiring specialized knowledge
- Tasks where consistency is critical

---

## 2. Few-Shot Prompting

**When to use:** Tasks requiring consistent formatting or domain-specific patterns.

**Pattern:**
```
[Task description]

Example 1:
Input: [example input]
Output: [example output]

Example 2:
Input: [example input]
Output: [example output]

Now process:
Input: [actual input]
Output:
```

**Example:**

Input:
```
Extract the company name and founding year from the text.

Example 1:
Input: "Apple Inc. was founded in 1976 by Steve Jobs."
Output: {"company": "Apple Inc.", "year": 1976}

Example 2:
Input: "Microsoft Corporation started in 1975."
Output: {"company": "Microsoft Corporation", "year": 1975}

Example 3:
Input: "Founded in 1994, Amazon has grown into a tech giant."
Output: {"company": "Amazon", "year": 1994}

Now process:
Input: "Tesla, Inc. was established in 2003 by Martin Eberhard."
Output:
```

Expected Output:
```
{"company": "Tesla, Inc.", "year": 2003}
```

**Example selection guidelines:**
| Example Type | Purpose | Count |
|--------------|---------|-------|
| Simple/typical | Establish basic pattern | 1-2 |
| Edge case | Handle ambiguity | 1 |
| Different format | Show variations | 1 |
| **Total** | | **3-5** |

**Common mistakes:**
- Too many examples (wastes tokens, may confuse)
- Inconsistent formatting between examples
- Examples too similar (model doesn't learn variation)

---

## 3. Chain-of-Thought (CoT)

**When to use:** Math problems, logical reasoning, multi-step analysis.

**Pattern:**
```
[Problem]

Think through this step by step:
```

**Example:**

Input:
```
A store sells apples for $2 each. If you buy 5 or more, you get 20% off.
How much do 7 apples cost?

Think through this step by step:
```

Expected Output:
```
Step 1: Calculate the regular price for 7 apples
7 apples × $2 = $14

Step 2: Check if discount applies
7 apples ≥ 5 apples, so 20% discount applies

Step 3: Calculate the discount amount
20% of $14 = 0.20 × $14 = $2.80

Step 4: Calculate final price
$14 - $2.80 = $11.20

The 7 apples cost $11.20
```

**Variations:**
| Variation | Trigger Phrase | Use Case |
|-----------|----------------|----------|
| Basic CoT | "Think step by step" | General reasoning |
| Explicit steps | "Break this into numbered steps" | Complex procedures |
| Show work | "Show your calculations" | Math problems |
| Reasoning chain | "Explain your reasoning" | Justification needed |

**Zero-shot CoT:**
Simply append "Let's think step by step." to any prompt.

---

## 4. Role Prompting

**When to use:** Tasks requiring expertise, specific perspective, or consistent persona.

**Pattern:**
```
You are a [role/expert description].

[Context about the task]

[Specific instruction]
```

**Example:**

Input:
```
You are a senior security engineer with 15 years of experience in web application security.

Review the following code snippet for security vulnerabilities:

```python
def login(username, password):
    query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
    result = db.execute(query)
    return result
```

Identify vulnerabilities and provide specific fixes.
```

Expected Output:
```
Security Vulnerabilities Identified:

1. SQL Injection (Critical)
   - The code directly interpolates user input into SQL query
   - Attacker can input: username=' OR '1'='1' --
   - This bypasses authentication entirely

   Fix:
   ```python
   def login(username, password):
       query = "SELECT * FROM users WHERE username=? AND password=?"
       result = db.execute(query, (username, password))
       return result
   ```

2. Plain-text Password Storage (Critical)
   - Passwords appear to be stored and compared in plain text
   - Fix: Use bcrypt or argon2 for password hashing

3. Missing Rate Limiting (Medium)
   - No protection against brute force attacks
   - Fix: Implement login attempt throttling
```

**Effective role descriptions:**
| Weak | Strong |
|------|--------|
| "You are an expert" | "You are a senior data scientist with 10 years of experience in NLP" |
| "You are helpful" | "You are a patient teacher explaining concepts to beginners" |
| "You know about X" | "You are a certified AWS solutions architect specializing in serverless" |

---

## 5. Structured Output

**When to use:** When you need parseable responses (JSON, XML, CSV).

**Pattern:**
```
[Task instruction]

Respond in JSON format with exactly these fields:
- field1 (type): description
- field2 (type): description

[Input]

Return ONLY valid JSON, no markdown or explanation.
```

**Example:**

Input:
```
Extract meeting details from this email.

Respond in JSON format with exactly these fields:
- date (string, ISO format): Meeting date
- time (string, 24h format): Meeting time
- attendees (array of strings): List of attendees
- topic (string): Meeting topic
- location (string or null): Meeting location if mentioned

Email: "Hi team, let's meet tomorrow at 2pm to discuss Q4 planning.
Sarah, Mike, and Lisa should attend. We'll use Conference Room B."

Today's date is 2024-01-15.

Return ONLY valid JSON, no markdown or explanation.
```

Expected Output:
```json
{
  "date": "2024-01-16",
  "time": "14:00",
  "attendees": ["Sarah", "Mike", "Lisa"],
  "topic": "Q4 planning",
  "location": "Conference Room B"
}
```

**Format enforcement techniques:**
```
# Strong enforcement
"Return ONLY valid JSON. Start with { and end with }"

# Schema validation hint
"The output must be valid JSON matching this TypeScript type:
type Output = { name: string; age: number; active: boolean }"

# Negative instruction
"Do NOT include markdown code blocks. Do NOT add explanations."
```

If the response must satisfy deterministic field-level syntax or an enumerated action space, move from prompt-only structured output to constrained generation. See [guidance-constrained-generation.md](./guidance-constrained-generation.md).

---

## 6. Self-Consistency

**When to use:** Complex reasoning where multiple valid paths exist.

**Pattern:**
1. Generate multiple reasoning paths (temperature > 0)
2. Extract final answers from each path
3. Select most common answer (majority vote)

**Example approach:**

```
# Run this prompt 5 times with temperature=0.7

Solve this logic puzzle. Think through it step by step.

Three friends (Alice, Bob, Carol) each have a different pet (cat, dog, bird).
- Alice doesn't have the dog
- The person with the bird is not Carol
- Bob's pet has four legs

What pet does each person have?
```

**Implementation:**
```python
# Pseudo-code for self-consistency
answers = []
for i in range(5):
    response = llm.generate(prompt, temperature=0.7)
    answer = extract_final_answer(response)
    answers.append(answer)

final_answer = majority_vote(answers)
```

**When to use:**
- Math word problems
- Logic puzzles
- Any task where you can verify consistency

---

## 7. ReAct (Reasoning + Acting)

**When to use:** Tasks requiring external tool use or information gathering.

**Pattern:**
```
Answer the question using the available tools.

Tools available:
- search(query): Search the web
- calculate(expression): Evaluate math
- lookup(term): Look up in knowledge base

Format your response as:
Thought: [reasoning about what to do]
Action: [tool_name(arguments)]
Observation: [result from tool]
... (repeat as needed)
Thought: I now have enough information
Final Answer: [answer]

Question: [user question]
```

**Example:**

Input:
```
Question: What is the population of France divided by the population of Belgium?
```

Expected Output:
```
Thought: I need to find the population of France and Belgium, then calculate the ratio.

Action: search("population of France 2024")
Observation: France has a population of approximately 67.75 million.

Thought: Now I need Belgium's population.

Action: search("population of Belgium 2024")
Observation: Belgium has a population of approximately 11.7 million.

Thought: Now I can calculate the ratio.

Action: calculate(67.75 / 11.7)
Observation: 5.79

Thought: I now have enough information to answer.

Final Answer: The population of France is approximately 5.79 times the population of Belgium.
```

---

## 8. Tree of Thoughts

**When to use:** Complex problems requiring exploration of multiple solution paths.

**Pattern:**
```
Problem: [complex problem]

Generate 3 different approaches to solve this:

Approach 1: [description]
Evaluation: [pros/cons]

Approach 2: [description]
Evaluation: [pros/cons]

Approach 3: [description]
Evaluation: [pros/cons]

Best approach: [selection with reasoning]
Solution using best approach: [detailed solution]
```

**Example:**

Input:
```
Problem: Design a system to handle 10,000 concurrent user sessions with sub-100ms response times.

Generate 3 different architectural approaches:
```

Expected Output:
```
Approach 1: Horizontal scaling with load balancer
- Multiple stateless app servers behind load balancer
- Session state in Redis cluster
Evaluation: Simple, proven pattern. May have Redis as bottleneck.

Approach 2: Serverless with edge computing
- AWS Lambda@Edge or Cloudflare Workers
- Session state in DynamoDB Global Tables
Evaluation: Auto-scales, but cold starts may impact latency.

Approach 3: Actor model with sticky sessions
- Akka/Orleans cluster with virtual actors
- Session state co-located with actor
Evaluation: Lowest latency, but complex to operate.

Best approach: Approach 1 (Horizontal scaling)
Reasoning: Best balance of simplicity, reliability, and performance for the given requirements.

Solution: [detailed architecture follows]
```

---

## 9. Retrieval-Augmented Generation

**When to use:** Tasks requiring factual accuracy or current information.

**Pattern:**
```
Use the following context to answer the question. If the answer is not in the context, say "I don't have information about that."

Context:
[retrieved documents]

Question: [user question]

Answer based only on the context provided:
```

**Example:**

Input:
```
Use the following context to answer the question.

Context:
Document 1: "The Acme Widget 3000 was released in March 2024. It features
a 12-hour battery life and weighs 250 grams."

Document 2: "Pricing for the Acme Widget 3000 starts at $299 for the base
model. The Pro version with extended battery is $399."

Question: How much does the Acme Widget 3000 cost and what is its battery life?

Answer based only on the context provided:
```

Expected Output:
```
The Acme Widget 3000 starts at $299 for the base model, with a Pro version
available at $399. The standard model has a 12-hour battery life.
```

**Chunking strategies:**
| Strategy | Chunk Size | Overlap | Best For |
|----------|------------|---------|----------|
| Fixed | 500 tokens | 50 tokens | General purpose |
| Semantic | Paragraph | None | Well-structured docs |
| Sentence | 3-5 sentences | 1 sentence | Q&A systems |

---

## 10. Meta-Prompting

**When to use:** Generating or improving prompts programmatically.

**Pattern:**
```
You are a prompt engineering expert.

Task: [description of what the prompt should do]
Target model: [GPT-4/Claude/etc.]
Constraints: [length limits, format requirements]

Generate an optimized prompt for this task.
```

**Example:**

Input:
```
You are a prompt engineering expert.

Task: Create a prompt that extracts action items from meeting notes
Target model: GPT-4
Constraints:
- Output must be valid JSON
- Each action item needs: task, owner, due_date
- Handle cases where information is missing

Generate an optimized prompt for this task.
```

Expected Output:
```
Extract action items from the following meeting notes.

For each action item, identify:
- task: The specific action to be taken
- owner: Person responsible (use "Unassigned" if not mentioned)
- due_date: Deadline in YYYY-MM-DD format (use null if not specified)

Meeting Notes:
{meeting_notes}

Respond with a JSON array. Example format:
[
  {"task": "Review proposal", "owner": "Sarah", "due_date": "2024-01-20"},
  {"task": "Send update", "owner": "Unassigned", "due_date": null}
]

Return ONLY the JSON array, no additional text.
```

---

## Pattern Selection Guide

| Task Type | Recommended Pattern |
|-----------|---------------------|
| Simple classification | Zero-shot |
| Consistent formatting needed | Few-shot |
| Math/logic problems | Chain-of-Thought or Program-of-Thought |
| Need expertise/perspective | Role Prompting |
| API integration | Structured Output |
| High-stakes decisions | Self-Consistency |
| Tool use required | ReAct |
| Complex problem solving | Tree of Thoughts or Skeleton-of-Thought |
| Factual Q&A | RAG |
| Prompt generation | Meta-Prompting |
| Reducing careless errors | RE2 / RaR |
| Perspective-dependent reasoning | SimToM |
| Model hallucinating on complex tasks | Step-Back + Self-Verification |
| Long multi-step workflows | Plan-and-Solve + Least-to-Most |
| Diverse ensemble needed | Prompt Paraphrasing + Universal Self-Consistency |
| Format/output regression detected | Calibration + Self-Refinement |

---

## 11. Advanced Compact Reference

### Step-Back Prompting

```
First, answer this more general question:
{abstract_question}

Now use that to answer the specific question:
{specific_question}
```

**When to use:** The model fails on specific questions because it skips relevant principles. Force it to retrieve the principle first.

---

### SimToM (Simulation Theory of Mind)

```
Consider the following scenario:
{scenario}

From {character}'s perspective, what do they know at this moment?
What information do they NOT have access to?

Now answer: {question}
```

**When to use:** Questions requiring perspective-taking (negotiation, user modeling, theory-of-mind tasks).

---

### RaR / RE2 (Rephrase and Re-read)

```
[RaR] Rephrase the following question in your own words before answering:
{question}

[RE2] Read this question twice before answering:
{question}
{question}
```

**When to use:** Careless errors on well-defined problems. Cheap, zero-shot, high reliability gain.

---

### Least-to-Most Decomposition

```
To solve: {complex_problem}

First, what is the simplest sub-problem I need to solve?
[solve it]

What is the next sub-problem, given what I now know?
[solve it]

[repeat until done]
```

**When to use:** Problems with ordered dependencies. More reliable than asking for the full answer at once.

---

### Self-Verification

```
Here is my answer to {question}:
{answer}

Now verify: is each step logically sound? Are any assumptions unjustified?
List any errors found.

If errors found: provide a corrected answer.
If no errors: confirm the answer is correct.
```

**When to use:** After Chain-of-Thought on high-stakes problems.

---

### Memory-of-Thought

```
Before answering {question}, recall relevant past reasoning or facts you know about this topic.

[recalled knowledge]

Now answer {question} using this context.
```

**When to use:** Domain-specific questions where recalling prior reasoning improves reliability.

---

### Uncertainty-Routed CoT

```python
# Pseudo-implementation
answer_greedy = llm.generate(question, temperature=0)
if confidence(answer_greedy) > THRESHOLD:
    return answer_greedy
else:
    # Route to CoT
    answer_cot = llm.generate(COT_PROMPT + question, temperature=0)
    return answer_cot
```

**When to use:** Cost-sensitive applications where CoT is only needed for uncertain cases.
