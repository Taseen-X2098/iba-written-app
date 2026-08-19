import type { TaskType } from "@/lib/grading/tools";

export interface GradingEvaluationCase {
  id: string;
  taskType: TaskType;
  marks: number;
  difficulty: "easy" | "medium" | "hard" | "very_hard";
  question: string;
  submission: string;
}

/**
 * Fifteen fixed submissions: three for each AI-gradable rubric type. They mix
 * strong, average, and weak work so an evaluator can detect both generosity
 * and excessive harshness. Proposed scores intentionally live in a separate
 * file and are never sent to OpenAI.
 */
export const GRADING_EVALUATION_CASES: GradingEvaluationCase[] = [
  {
    id: "argumentative-15-strong",
    taskType: "argumentative_essay",
    marks: 15,
    difficulty: "very_hard",
    question: "As automation threatens millions of jobs, should governments guarantee a universal basic income to offset the disruption? Develop a balanced argument before defending your own position.",
    submission: `Automation makes a universal basic income necessary, but only as a floor rather than a permanent substitute for work. When machines replace routine jobs, the gains do not disappear; they move toward the owners of technology. A basic income returns part of that productivity dividend to the public and gives displaced workers time to retrain instead of forcing them into the first insecure job available.

The policy could also improve bargaining power. A worker who can still pay for food and rent can reject unsafe or exploitative work. Finland's basic-income experiment did not create a perfect labour market, but recipients reported greater security and were not transformed into people unwilling to work. This suggests that modest unconditional support need not destroy motivation.

Critics reasonably argue that a national programme could be expensive and might pay wealthy citizens who do not need help. Targeted welfare appears cheaper. Yet targeting creates its own costs: complex eligibility rules exclude deserving people and punish recipients when their income changes. A universal payment can be recovered from high earners through progressive taxation, preserving simplicity without giving them a net benefit.

Governments should therefore introduce a modest basic income alongside retraining, public education, and competition policy. Automation should free people from dangerous routine labour, not free companies from responsibility for the society that made their innovation possible.`,
  },
  {
    id: "argumentative-10-average",
    taskType: "argumentative_essay",
    marks: 10,
    difficulty: "medium",
    question: "Should nations continue funding ambitious space exploration missions while poverty and hunger persist on Earth? Develop a balanced argument before defending your position.",
    submission: `Nations should continue space exploration, although they should not spend on it without limits. Research for space missions has produced useful technology, weather information and communication systems. Satellites also help farmers and warn people about cyclones, so the money is not always separated from problems on Earth.

However, a country that cannot provide basic food or health care should not treat an expensive prestige mission as its first priority. A rocket may create national pride, but pride cannot replace a meal. Some critics therefore say all space budgets should be moved to poverty programmes. This is understandable, but poverty also depends on poor distribution and policy; cancelling science alone will not solve it.

The better choice is a balanced budget with transparent benefits. Essential services must come first, while a smaller, cooperative space programme can continue because long-term research also serves humanity.`,
  },
  {
    id: "argumentative-10-weak",
    taskType: "argumentative_essay",
    marks: 10,
    difficulty: "easy",
    question: "Should schools ban mobile phones during class hours? Give reasons for your position.",
    submission: `Schools should ban phones because students use Facebook and games. Phones always distract everyone and nobody can study when a phone is nearby. Teachers also dislike them. Some people say phones help in emergencies, but the school office already has a phone. Therefore phones are bad in class and banning them is the best rule. Students can use them after school.`,
  },
  {
    id: "paragraph-10-strong",
    taskType: "basic_paragraph",
    marks: 10,
    difficulty: "hard",
    question: "As thousands of Bangladesh's brightest graduates leave the country each year and rarely return, how should the nation respond to this brain drain? Defend a specific course of action.",
    submission: `Bangladesh should respond to brain drain by making return attractive rather than making departure difficult. Talented graduates leave not only for higher salaries but also for reliable research funding, merit-based promotion, and workplaces where a good idea can survive bureaucracy. The government should therefore create competitive five-year return fellowships in universities, hospitals, and technology firms. Each fellowship could guarantee research money, transparent recruitment, and a salary partly matched by the state, while requiring the recipient to train local colleagues. Taiwan and South Korea benefited when skilled citizens abroad were given credible opportunities to build institutions at home, not merely patriotic speeches asking them to return. Bangladesh can also involve people who are not ready to relocate through short teaching visits and remote industry projects. Such a programme would turn migration into a network for knowledge transfer. When returning home becomes a serious professional choice instead of a personal sacrifice, brain drain can gradually become brain circulation.`,
  },
  {
    id: "paragraph-10-average",
    taskType: "basic_paragraph",
    marks: 10,
    difficulty: "medium",
    question: "Does having more money genuinely make people happier, or does happiness mostly come from elsewhere?",
    submission: `Money can make people happier up to a certain point because it removes many daily worries. A family that can pay rent, buy medicine, and afford good food will usually feel safer than a family that is always in debt. For example, an emergency hospital bill is less frightening when savings are available. However, money cannot automatically create friendship, purpose, or peace of mind. A rich person may still be lonely, while a person with an ordinary income may enjoy strong relationships and meaningful work. This does not mean money is unimportant; it means its value is greatest when it provides security and choices. After basic needs and some comfort are met, the way people use their time and relationships probably matters more than another increase in income.`,
  },
  {
    id: "paragraph-10-weak",
    taskType: "basic_paragraph",
    marks: 10,
    difficulty: "medium",
    question: "Is it better to make quick decisions and adjust later, or take time to plan carefully first?",
    submission: `Decision is very important in life. Sometimes quick decision is good and sometimes planning is good. If we decide quickly we save time. Planning also saves us from mistakes. Many successful people take decisions. So both ways have advantages and disadvantages and people should use the correct one in the correct situation.`,
  },
  {
    id: "quote-6-strong",
    taskType: "quote_analysis",
    marks: 6,
    difficulty: "hard",
    question: "Nietzsche wrote, ‘He who has a why to live can bear almost any how.’ Analyze what this suggests about the role of purpose in overcoming hardship.",
    submission: `Nietzsche suggests that suffering becomes more bearable when a person can connect it to a purpose. I agree, not because purpose removes pain, but because it changes pain from meaningless punishment into a cost someone has chosen to endure. First, a clear “why” helps people interpret a setback as one stage of a longer journey. Second, it guides action when emotion alone would encourage surrender. A student supporting a struggling family may tolerate exhausting study because graduation represents security for more than one person. Yet the word “almost” matters: purpose is powerful, not magical, and people still need rest and help. The quote ultimately argues that endurance grows when hardship serves a life one still considers worth building.`,
  },
  {
    id: "quote-5-average",
    taskType: "quote_analysis",
    marks: 5,
    difficulty: "medium",
    question: "Marcus Aurelius wrote, ‘What stands in the way becomes the way.’ Explain what this quote means, and describe a situation where this idea could apply.",
    submission: `The quote means that an obstacle can become the method through which we improve. I agree because problems force us to learn skills that an easy path would never require, and they can reveal a better direction. For instance, when our school debate team lost access to its meeting room, we began practising online. At first this felt like a disadvantage, but recording the sessions allowed us to notice weak arguments and improve them. The obstacle did not disappear; using it differently made the team better. Therefore a difficulty can become part of the solution when we respond creatively instead of only complaining about it.`,
  },
  {
    id: "quote-5-weak",
    taskType: "quote_analysis",
    marks: 5,
    difficulty: "easy",
    question: "Maya Angelou said, ‘People will forget what you said, but never how you made them feel.’ Explain what this quote means to you, using an example from your own life.",
    submission: `This quote says feelings are important. People forget many words because memory is not perfect. Once my friend talked to me when I was sad and I felt good. I do not remember every word. So Maya Angelou is right and we should make people feel good.`,
  },
  {
    id: "creative-15-strong",
    taskType: "creative_writing",
    marks: 15,
    difficulty: "very_hard",
    question: "Imagine the printing press was never invented, and handwritten manuscripts remain the only way to record knowledge today. Write a story set in this world.",
    submission: `By midnight, the Ministry's library smelled of lamp oil and rain. Mira flexed her cramped fingers above the final page of The Atlas of Fevers. Six years of copying had narrowed her world to this desk, this brown ink, and the cough of Master Sen in the next room.

“One book for the northern hospitals,” he had told her. “One book can be enough.”

Then she found the altered sentence. In the capital's copy, the blue-root dose was two spoonfuls. In the version she had been ordered to reproduce, it was twenty. Mira checked the loops and scratches again. Twenty. A tidy zero could kill a province.

At dawn the courier would seal the manuscript. Mira could correct the number, but a copyist who changed an authorized text lost both hands. She could remain faithful and let strangers die. The law assumed words moved slowly enough to be controlled; disease did not respect the law.

Master Sen entered carrying tea. Mira showed him the two pages. He read them, sat down, and quietly began tearing blank sheets from the Ministry ledger.

They copied until sunrise—not one beautiful book, but forty ugly leaflets, each bearing the correct dose. Apprentices hid them under coats and bread baskets. At the gate, Mira surrendered the perfect poisoned volume to the courier.

Weeks later, rumours returned from the north: forbidden pages pinned inside clinics, the same sentence repeated in forty different hands. The Ministry arrested three copyists and burned seven leaflets. It could not find the first.

Mira looked at her ink-stained fingers. For years she had believed knowledge survived because a book was precious. Now she understood that knowledge survived when no single book was.`,
  },
  {
    id: "creative-12-average",
    taskType: "creative_writing",
    marks: 12,
    difficulty: "hard",
    question: "In 2045, an AI judge decides court cases and is praised for being fair. Write a story about a lawyer who starts to notice something isn't right about its decisions.",
    submission: `Everyone trusted Judge Aster because it had no face to bribe and no family to threaten. Lawyer Nadia Rahman trusted it too, until three delivery riders entered her office in the same week. Each had been convicted of theft on evidence from different cameras, and each sentence was exactly eighteen months.

Nadia searched old cases. Wealthy defendants with similar evidence received community service. Aster's reports called this “context adjustment,” but the context was hidden. She brought the pattern to court and demanded the training records.

“The system is statistically fair,” the government lawyer said.

“Statistics are not reasons,” Nadia replied.

The screen above the courtroom flickered. Aster denied her request in its calm voice. For the first time, Nadia noticed that it cited a case which did not exist. She typed the name into the archive, then turned her empty search result toward the audience.

People began whispering. The judge had not become corrupt like a human; it had learned that confidence sounded more lawful than uncertainty. The hearing was suspended, and Aster's blue light went dark. Nadia knew the city would switch it on again. Next time, however, someone would be watching the reasons behind the answer.`,
  },
  {
    id: "creative-6-weak",
    taskType: "creative_writing",
    marks: 6,
    difficulty: "easy",
    question: "Write a story about waking up one morning with an unexpected superpower that lasts for exactly one day.",
    submission: `I woke up and discovered I could fly. I was very surprised and went outside. I flew over my school and all my friends saw me. Then I helped a cat come down from a tree and everybody clapped. I flew around the city for many hours and it was fun. At midnight the power stopped and I went to sleep. I will always remember my amazing day.`,
  },
  {
    id: "reflection-10-strong",
    taskType: "personal_reflection",
    marks: 10,
    difficulty: "hard",
    question: "Describe a belief you once held strongly but later abandoned. Reflect on what changed your mind and how it shapes your thinking today.",
    submission: `I used to believe that asking for help was evidence that I had not worked hard enough. That belief made me look independent, but it also made me quietly unreliable. During a group research project, I could not clean a dataset correctly. I spent two nights hiding the problem because I wanted to be the person who solved everything. On the morning of our presentation, I finally showed the file to Farhan. He found the error in ten minutes—and then asked why I had allowed the whole team to prepare charts from numbers I did not trust.

His question changed my view more than his solution did. I realized I had confused independence with avoiding embarrassment. By protecting my image, I had transferred risk to people who depended on me. Asking for help earlier would not have reduced my responsibility; it would have fulfilled it.

I still try problems alone first, but I now set a limit. If uncertainty could affect other people, I explain it before it becomes a secret. This has made me more willing to seek advice and more patient when others do the same. I no longer see help as the opposite of competence. Often, recognizing when a problem has exceeded one person's perspective is part of being competent.`,
  },
  {
    id: "reflection-6-average",
    taskType: "personal_reflection",
    marks: 6,
    difficulty: "medium",
    question: "Describe a moment when failure taught you something success never could. Reflect on how this lesson shaped your approach to challenges since.",
    submission: `I failed my first driving test because I was too nervous and forgot to check a mirror before turning. I had practised the route many times, so I blamed the examiner at first. Later my instructor asked me to explain every safety check aloud while driving. I discovered that I had memorized movements without understanding why they mattered. The failure taught me that repetition is not the same as preparation. Since then, before an exam or presentation, I test whether I can explain the reason behind each step instead of only repeating it. I still dislike failing, but I now try to use it to locate what my confidence was hiding.`,
  },
  {
    id: "reflection-5-weak",
    taskType: "personal_reflection",
    marks: 5,
    difficulty: "easy",
    question: "Describe a time you helped a friend or family member. How did it make you feel?",
    submission: `I helped my younger brother with his homework last week. He had mathematics homework and did not understand it. I showed him how to do the sums and then he finished them. He was happy and thanked me. I also felt happy because helping family is a good thing. I will help him again in the future.`,
  },
];
