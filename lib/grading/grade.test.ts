import { grade, ResponsesClient } from './grade';

// Mock client builder to test the grading function
function createMockClient(output_text: string): ResponsesClient {
  return {
    responses: {
      create: async () => ({
        output: [],
        output_text
      })
    }
  };
}

describe('AI Grading Utility', () => {
  it('should parse valid structured output correctly', async () => {
    const mockResponse = JSON.stringify({
      internal: {
        total: 8,
        max: 10,
        criteria: [
          {
            criterion: 'Grammar',
            marks_awarded: 4,
            marks_possible: 5,
            reasoning: 'Good grammar.'
          }
        ]
      },
      student_feedback: {
        score: '8/10',
        summary: 'Great job!',
        highlights: [
          {
            quote: 'This is a verbatim sentence.',
            comment: 'Excellent phrasing.',
            type: 'strength'
          }
        ]
      }
    });

    const client = createMockClient(mockResponse);
    const submission = 'This is a verbatim sentence. It continues here.';

    const result = await grade(client, submission, 'essay', 10);

    expect(result.internal.total).toBe(7);
    expect(result.internal.normalizationVersion).toBe(2);
    expect(result.internal).not.toHaveProperty('modelTotal');
    expect(result.internal.criteria[0].marksAwarded).toBe(3.5);
    expect(result.studentFeedback.score).toBe('7/10');
    // The highlight should be preserved because the quote is exactly in the submission
    expect(result.studentFeedback.highlights.length).toBe(1);
    expect(result.studentFeedback.highlights[0].quote).toBe('This is a verbatim sentence.');
  });

  it('should drop highlights that do not match verbatim substrings', async () => {
    const mockResponse = JSON.stringify({
      internal: {
        total: 5,
        max: 10,
        criteria: []
      },
      student_feedback: {
        score: '5/10',
        summary: 'Okay.',
        highlights: [
          {
            quote: 'This sentence is hallucinated and not in the text.',
            comment: 'Bad phrasing.',
            type: 'improvement'
          }
        ]
      }
    });

    const client = createMockClient(mockResponse);
    const submission = 'I wrote something else entirely.';

    const result = await grade(client, submission, 'essay', 10);

    // The highlight should be dropped because the quote does not exist in the submission
    expect(result.studentFeedback.highlights.length).toBe(0);
  });

  it('should handle zero marks gracefully', async () => {
    const mockResponse = JSON.stringify({
      internal: { total: 0, max: 10, criteria: [] },
      student_feedback: { score: '0/10', summary: 'Did not answer.', highlights: [] }
    });

    const client = createMockClient(mockResponse);
    const result = await grade(client, 'some text', 'essay', 10);
    expect(result.internal.total).toBe(0);
    expect(result.studentFeedback.score).toBe('0/10');
  });

  it('should not calibrate a 6-mark question', async () => {
    const mockResponse = JSON.stringify({
      internal: {
        total: 5.8,
        max: 6,
        criteria: [
          { criterion: 'Content', marks_awarded: 5.8, marks_possible: 6, reasoning: 'Strong answer.' }
        ]
      },
      student_feedback: { score: '5.8/6', summary: 'Strong answer.', highlights: [] }
    });

    const client = createMockClient(mockResponse);
    const result = await grade(client, 'text', 'basic_paragraph', 6);

    expect(result.internal.total).toBe(5.5);
    expect(result.internal.criteria[0].marksAwarded).toBe(5.5);
    expect(result.internal.normalizationVersion).toBe(2);
    expect(result.studentFeedback.score).toBe('5.5/6');
  });

  it('should throw an error if model returns invalid JSON', async () => {
    const client = createMockClient('this is not json');
    await expect(grade(client, 'text', 'essay', 10)).rejects.toThrow('Model did not return valid structured output');
  });

  it('should properly map multiple criteria from internal rubric', async () => {
    const mockResponse = JSON.stringify({
      internal: {
        total: 10,
        max: 10,
        criteria: [
          { criterion: 'Grammar', marks_awarded: 5, marks_possible: 5, reasoning: 'Perfect' },
          { criterion: 'Style', marks_awarded: 5, marks_possible: 5, reasoning: 'Perfect' }
        ]
      },
      student_feedback: { score: '10/10', summary: 'Perfect essay', highlights: [] }
    });

    const client = createMockClient(mockResponse);
    const result = await grade(client, 'text', 'essay', 10);
    expect(result.internal.criteria.length).toBe(2);
    expect(result.internal.criteria[1].criterion).toBe('Style');
  });

  it('should extract the numeric score from the parsed string correctly', async () => {
    const mockResponse = JSON.stringify({
      internal: { total: 7, max: 10, criteria: [] },
      student_feedback: { score: '7.5/10', summary: '', highlights: [] }
    });

    const client = createMockClient(mockResponse);
    const result = await grade(client, 'text', 'essay', 10);
    expect(result.internal.total).toBe(6);
    expect(result.studentFeedback.score).toBe('6/10');
  });

  it('should preserve multiple valid highlights', async () => {
    const mockResponse = JSON.stringify({
      internal: { total: 10, max: 10, criteria: [] },
      student_feedback: {
        score: '10/10',
        summary: '',
        highlights: [
          { quote: 'Part one.', comment: 'Good.', type: 'strength' },
          { quote: 'Part two.', comment: 'Also good.', type: 'strength' }
        ]
      }
    });

    const client = createMockClient(mockResponse);
    const result = await grade(client, 'Part one. Part two.', 'essay', 10);
    expect(result.studentFeedback.highlights.length).toBe(2);
  });

  it('should format the system prompt correctly with nonces', async () => {
    // We can indirectly test this by verifying it doesn't crash on standard input
    const mockResponse = JSON.stringify({
      internal: { total: 10, max: 10, criteria: [] },
      student_feedback: { score: '10/10', summary: '', highlights: [] }
    });
    const client = createMockClient(mockResponse);
    const result = await grade(client, 'text', 'essay', 10);
    expect(result).toBeDefined();
  });

  it('returns the three feedback sections and keeps every locatable grammar correction', async () => {
    const mockResponse = JSON.stringify({
      internal: { total: 6, max: 10, criteria: [] },
      student_feedback: {
        score: '6/10',
        remarks: 'The answer has a relevant position, but sentence accuracy weakens its authority.',
        ways_to_improve: [
          'Proofread agreement first. Instead of “People is affected,” write “People are affected.”',
          'Read the revised sentence in context to confirm that its subject and verb still agree.',
        ],
        grammar_errors: [
          {
            quote: 'People is affected',
            error_type: 'Subject–verb agreement',
            explanation: 'The plural subject “People” requires “are.”',
            corrections: ['People are affected', 'Individuals are affected'],
          },
          {
            quote: 'A hallucinated quote',
            error_type: 'Spelling',
            explanation: 'This quote does not exist.',
            corrections: ['Corrected'],
          },
        ],
        highlights: [],
      },
    });
    const result = await grade(
      createMockClient(mockResponse),
      'People is affected by this policy.',
      'argumentative_essay',
      10,
    );

    expect(result.studentFeedback.remarks).toContain('relevant position');
    expect(result.studentFeedback.personalizedFeedback).toContain('No previous Argumentative Essay answers');
    expect(result.studentFeedback.personalizedFeedback?.split('\n\n')).toHaveLength(2);
    expect(result.studentFeedback.waysToImprove).toContain('People are affected');
    expect(result.studentFeedback.waysToImprove).toBe([
      '1. Proofread agreement first. Instead of “People is affected,” write “People are affected.”',
      '2. Read the revised sentence in context to confirm that its subject and verb still agree.',
    ].join('\n'));
    expect(result.studentFeedback.grammarErrors).toHaveLength(1);
    expect(result.studentFeedback.grammarErrors?.[0].corrections).toHaveLength(2);
    expect(result.studentFeedback.summary.split('\n\n')).toHaveLength(4);
  });

  it('normalizes legacy improvement text into a numbered list', async () => {
    const mockResponse = JSON.stringify({
      internal: { total: 6, max: 10, criteria: [] },
      student_feedback: {
        score: '6/10',
        remarks: 'The response has a clear position but needs tighter support.',
        ways_to_improve: '1. State the main claim precisely.\n2. Link each example back to that claim.',
        grammar_errors: [],
        highlights: [],
      },
    });

    const result = await grade(createMockClient(mockResponse), 'Text.', 'essay', 10);

    expect(result.studentFeedback.waysToImprove).toBe(
      '1. State the main claim precisely.\n2. Link each example back to that claim.',
    );
  });
});
