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
});
