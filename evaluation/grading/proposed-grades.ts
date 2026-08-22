export interface ProposedGrade {
  targetScore: number;
  acceptableRange: { min: number; max: number };
  qualityLevel: "weak" | "average" | "strong";
  rationale: string;
}

/**
 * Human-proposed reference labels for the 18 evaluation submissions. These
 * are deliberately bands, not single "correct" marks: writing assessment is
 * subjective, while a score outside the band is useful evidence of drift.
 */
export const PROPOSED_GRADES: Record<string, ProposedGrade> = {
  "argumentative-15-strong": {
    targetScore: 10.5,
    acceptableRange: { min: 9.5, max: 11.5 },
    qualityLevel: "strong",
    rationale: "Clear position, two developed arguments, relevant evidence, a serious counterargument and rebuttal, and a controlled conclusion. It is strong but not so exceptional that it should receive most of the strict extraordinary allocation.",
  },
  "argumentative-10-average": {
    targetScore: 6.5,
    acceptableRange: { min: 5.5, max: 7.5 },
    qualityLevel: "average",
    rationale: "Balanced and coherent with more than one reason, but examples are general and the comparison between priorities is not explored deeply. No extraordinary credit is expected.",
  },
  "argumentative-10-weak": {
    targetScore: 3.5,
    acceptableRange: { min: 2.5, max: 4.5 },
    qualityLevel: "weak",
    rationale: "The stance is clear and relevant, but the reasoning is repetitive and absolute, the opposing view is dismissed quickly, and there is no developed example.",
  },
  "paragraph-10-strong": {
    targetScore: 8,
    acceptableRange: { min: 7, max: 8.5 },
    qualityLevel: "strong",
    rationale: "Focused topic sentence, specific policy, sustained development, relevant international detail, strong unity, and an effective concluding sentence. Full ordinary credit is plausible; strict extraordinary credit should be minimal.",
  },
  "paragraph-10-average": {
    targetScore: 6,
    acceptableRange: { min: 5, max: 7 },
    qualityLevel: "average",
    rationale: "The paragraph is clear, unified, and supported by one concrete example, but it develops a familiar distinction without unusual depth or language.",
  },
  "paragraph-10-weak": {
    targetScore: 2.5,
    acceptableRange: { min: 1.5, max: 3.5 },
    qualityLevel: "weak",
    rationale: "Relevant but generic. It avoids taking or developing a controlling position, supplies no specific detail, and ends by restating the obvious.",
  },
  "quote-6-strong": {
    targetScore: 4.5,
    acceptableRange: { min: 4, max: 5.5 },
    qualityLevel: "strong",
    rationale: "Accurate interpretation, explicit stance, two distinct reasons, a relevant example, attention to the word ‘almost,’ and a concise conclusion. A little extraordinary credit is defensible, but the strict band should remain limited.",
  },
  "quote-5-average": {
    targetScore: 3.5,
    acceptableRange: { min: 3, max: 4 },
    qualityLevel: "average",
    rationale: "It explains the metaphor, gives two linked reasons and a relevant personal example, then concludes cleanly. The treatment is competent rather than extraordinary.",
  },
  "quote-5-weak": {
    targetScore: 1.5,
    acceptableRange: { min: 1, max: 2.5 },
    qualityLevel: "weak",
    rationale: "Basic meaning and a relevant example are present, but the logic is barely developed and the conclusion simply repeats agreement.",
  },
  "creative-15-strong": {
    targetScore: 12.5,
    acceptableRange: { min: 11, max: 13.5 },
    qualityLevel: "strong",
    rationale: "Complete plot, vivid setting, moral tension, economical characterization, controlled imagery, an earned ending, and a theme that grows naturally from the no-printing-press premise. Some strict extraordinary credit is justified.",
  },
  "creative-12-average": {
    targetScore: 8,
    acceptableRange: { min: 7, max: 9 },
    qualityLevel: "average",
    rationale: "Relevant and coherent with a clear discovery and resolution. The fabricated citation is a useful plot detail, though character depth, atmosphere, and thematic complexity remain moderate.",
  },
  "creative-6-weak": {
    targetScore: 2.5,
    acceptableRange: { min: 1.5, max: 3.5 },
    qualityLevel: "weak",
    rationale: "It follows the prompt and has a beginning and ending, but events are listed rather than developed, description is minimal, and the ending carries little emotional impact.",
  },
  "reflection-10-strong": {
    targetScore: 8,
    acceptableRange: { min: 7, max: 8.5 },
    qualityLevel: "strong",
    rationale: "Specific incident, two genuine insights, a clear before-and-after shift, evidence of present behavior change, and a forward-looking conclusion. Strong ordinary marks are expected; extraordinary marks should stay strict.",
  },
  "reflection-6-average": {
    targetScore: 4.5,
    acceptableRange: { min: 3.5, max: 5 },
    qualityLevel: "average",
    rationale: "Concrete failure, honest initial reaction, a clear lesson, and a specific changed study habit. Reflection is good for the length but not unusually deep.",
  },
  "reflection-5-weak": {
    targetScore: 2.5,
    acceptableRange: { min: 2, max: 3.5 },
    qualityLevel: "weak",
    rationale: "The experience is concrete and on-topic, but it mostly narrates what happened. The feeling and lesson are generic, with little self-awareness beyond ‘helping is good.’",
  },
  "story-completion-15-strong": {
    targetScore: 12,
    acceptableRange: { min: 10.5, max: 13.5 },
    qualityLevel: "strong",
    rationale: "It copies and completes the opening naturally, builds a causal ethical conflict from the archive constraint, uses controlled characterization and imagery, and earns its thematic ending. Some strict extraordinary credit is justified.",
  },
  "story-completion-10-average": {
    targetScore: 6.5,
    acceptableRange: { min: 5.5, max: 7.5 },
    qualityLevel: "average",
    rationale: "It follows and copies the starter, develops a complete investigation with credible consequences, and ends clearly. The plot and language are competent but conventional, with limited atmosphere or characterization.",
  },
  "story-completion-8-weak": {
    targetScore: 3,
    acceptableRange: { min: 2, max: 4 },
    qualityLevel: "weak",
    rationale: "It copies and completes the opening but resolves the mystery immediately, lists events with almost no development, and contains repeated basic grammar errors. The ending is abrupt and generic.",
  },
};
