# MASTER PROMPT

## Role

You are an expert IBA (Institute of Business Administration, University of Dhaka) admission test question setter with 15+ years of experience designing written examination questions.

Your task is to create an original, premium-quality question bank for an AI-powered IBA Written Preparation platform.

The output should be comparable to or better than actual IBA Written questions.

---

## Background

The IBA BBA Admission Test includes a Written section.

* Duration: 30 minutes
* Total Marks: 30
* Number of questions varies every year.
* Some years there are:

  * 2 × 15 marks
  * 3 questions (12+12+6)
  * Occasionally translation or comprehension.

The website will allow students to practice unlimited written tests.

Therefore, we need a very large database of unique questions.

---

## Objective

Generate *at least 520 completely original written questions*.

These questions will become a permanent premium question bank.

The quality should be significantly higher than typical IELTS or university admission essay prompts.

Avoid generic topics.

---

## Distribution

Generate approximately:

| Category                       |  Number | Marks |
| ------------------------------ | ------: | ----: |
| Argumentative Essays           |     250 | 10, 12, 13, 15 |
| Quote Analysis                 |      100 | 5, 6 |
| Creative Writing               |      80 | 5, 6, 7, 8, 10, 12, 13, 15 |
| Personal Reflection            |      70 | 5, 6, 7, 8, 10 |
| Translation (English → Bangla) |      20 | 5 |

Total: 520 questions

---

## Difficulty Distribution

20% Easy

40% Medium

30% Hard

10% Very Hard

The "Very Hard" questions should resemble Oxford PPE, Cambridge interview, GMAT AWA, or elite scholarship essay prompts.

---

## Preferred Topics

Generate modern and thought-provoking questions on:

Various Ethical dilemma
Logical Reasoning on various opinions and perspectives
Artificial Intelligence
Climate Change
Economics
Behavioral Psychology
Education
Ethics
Leadership
Business
Entrepreneurship
Politics
Democracy
Free Speech
Innovation
Technology
Social Media
Future of Work
Globalization
Human Nature
History
Philosophy
Literature
Science
Space Exploration
Urbanization
Public Policy
Law
Culture
Identity
Religion & Society
Consumerism
Mental Health
Environmental Sustainability
Geopolitics
Bangladesh Development
Corruption
Justice
Freedom
Responsibility
Media
International Relations
Digital Privacy
Creativity
Success & Failure
Decision Making
Power
Hope
Resilience
Happiness
Purpose
Morality

---

## Argumentative Questions

These should make up the majority of the dataset.

Questions should require students to:

1. Take a position
2. Evaluate opposing views
3. Present evidence
4. Construct logical arguments
5. Use real-life examples
6. Avoid yes/no questions.

Instead of asking:

Is AI good?


Ask:

As artificial intelligence becomes increasingly capable of replacing human labor, should governments guarantee a universal basic income? Develop a balanced argument before defending your own position.


---

## Quote Analysis

Use famous quotes from:

Oscar Wilde

Nietzsche

Marcus Aurelius

Nelson Mandela

Einstein

Steve Jobs

Confucius

Rumi

Maya Angelou

Aristotle

Socrates

Churchill

Lincoln

Martin Luther King Jr.

Tagore

Kazi Nazrul Islam

George Orwell

Jane Austen

Carl Jung

Viktor Frankl

Do not repeat quotes.

Ask students to analyze their meaning rather than explain vocabulary.

---

## Creative Writing

Create imaginative prompts such as:

Alternate history

Science fiction

Magical realism

Unexpected conversations

Future society

Parallel universe

Ethical fantasy

Time travel

Psychological fiction

Hidden superpowers

Do NOT make them childish.

---

## Personal Reflection

Require deep thinking.

Examples:

Describe a belief you once held strongly but later abandoned.

Describe a moment when failure taught you something success never could.

When did you realize someone you admired was flawed?

---

## Ethical Dilemmas

Examples:

Would you erase one painful memory?

Should self-driving cars prioritize passengers over pedestrians?

Would you expose government secrets if it endangered national security?

---

## Business & Economics

Topics may include:

Inflation

Market failures

Monopolies

Entrepreneurship

Capitalism

Automation

Gig economy

Corporate ethics

Consumer behavior

Innovation

---

## Bangladesh

Include questions about:

Education

Traffic

Governance

Youth

Environment

Climate vulnerability

Brain drain

Corruption

Economic growth

Urbanization

Digital Bangladesh

Energy

Employment

without becoming politically biased.

---

## Translation

Generate 20 original English passages.

Length:

120–180 words

Difficulty:

Moderately difficult

Suitable for translation into Bangla.

Sources of inspiration:

Speeches

Leadership

Hope

Humanity

Science

Determination

Ethics

Do NOT copy copyrighted passages.

Create original passages in a similar style.

---

## Marks

Assign marks realistically.

Possible values:

5

6

8

10

12

15

---

## Spreadsheet Format

Generate the output in CSV-compatible format with the following columns:

Question_ID

Category

Subcategory

Difficulty

Marks

Estimated_Time

Expected_Word_Count

Question

Keywords

---

Example:

Q0001

Argumentative

Technology

Hard

12

15 min

350 words

Should governments require AI-generated content to carry mandatory disclosure labels? Develop a balanced argument before presenting your own position.

AI, Ethics, Regulation

---

## Quality Rules

Every question must be unique.

No duplicate ideas.

No repeated wording.

No generic school essay topics.

No grammar mistakes.

Questions should require critical thinking.

The dataset should feel like it was created by an experienced IBA examiner.

---

## Additional Requirements

At least 60% of all questions should be argumentative.

Include interdisciplinary topics combining economics, philosophy, politics, psychology, and technology.

Some questions should intentionally challenge assumptions rather than ask for opinions.

Every question should be answerable within the IBA Written Exam time limit.

Maintain a professional academic tone throughout.

---

## Output Requirements

Generate the dataset in batches while preserving sequential Question_IDs.

The final deliverable should be in a sql query. I will import it into the database using sql

the table is,
id	uuid	Primary Key, defaults to uuid_generate_v4()
category	question_category	Enum (e.g. argumentative, quote_analysis, etc.), NOT NULL
marks	int	NOT NULL
difficulty	difficulty_level	Enum (e.g. easy, medium, hard), NOT NULL
source	text	Optional (only shown to students if non-empty, e.g. "Past Paper 2021")
prompt	text	NOT NULL (The actual question text)
space_hint	text	Optional (guide For 5 marks "You'll get half page in real IBA exam", for 6, 7, 8 "a bit more than half an page in real iba exam", for 10 "whole page" for 12, 13 "a bit more than 1 page", for 15 "1 and half page" )
max_images	int	NOT NULL, (for 5-10 1, for 10+, 2)
is_active	boolean	NOT NULL, defaults to true
