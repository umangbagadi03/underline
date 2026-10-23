import { describe, it, expect } from 'vitest';
import { verifyAnswer } from '../rag/verification/verify.js';
import { extractNumbers } from '../rag/verification/numbers.js';
import { splitAnswer } from '../rag/verification/citations.js';

// The sentences we "gave" the model.
const supplied = new Map([
  ['S5', 'Room Rent, Boarding, Nursing Expenses up to 2% of the sum insured subject to maximum of Rs.5000/-, per day.'],
  ['S7', 'The Company shall indemnify medical expenses incurred for treatment of Cataract, subject to a limit of 25% of Sum Insured or Rs.40,000/-, whichever is lower, per each eye in one policy year.'],
  ['S9', 'Expenses related to the treatment of a pre-existing Disease shall be excluded until the expiry of 36 months of continuous coverage.'],
  ['S12', 'The grace period for payment of the premium shall be thirty days for renewal.'],
  ['S20', 'Expenses related to sterility and infertility are excluded.'],
]);

describe('extractNumbers', () => {
  it('reads Indian amounts the same way', () => {
    expect(extractNumbers('Rs. 5,00,000')).toEqual([500000]);
    expect(extractNumbers('5 lakh')).toEqual([500000]);
    expect(extractNumbers('Rs.5000/-')).toEqual([5000]);
  });

  it('reads number words', () => {
    expect(extractNumbers('thirty days')).toEqual([30]);
    expect(extractNumbers('forty five days')).toEqual([45]);
    expect(extractNumbers('twenty-four hours')).toEqual([24]);
  });

  it('reads percentages and decimals', () => {
    expect(extractNumbers('2% and 7.5 dioptres')).toEqual([2, 7.5]);
  });
});

describe('splitAnswer', () => {
  it('attaches a citation written after the full stop to the sentence before it', () => {
    const parts = splitAnswer('Room rent is capped at 2%. [S5] Cataract is covered [S7].');
    expect(parts.map((p) => p.ids)).toEqual([['S5'], ['S7']]);
  });

  it('reads grouped citations', () => {
    const [part] = splitAnswer('It is covered [S5, S7].');
    expect(part.ids).toEqual(['S5', 'S7']);
  });
});

describe('verifyAnswer', () => {
  it('keeps a correct cited sentence', () => {
    const result = verifyAnswer('Room rent is covered up to 2% of the sum insured, maximum Rs. 5,000 per day [S5].', supplied);
    expect(result.status).toBe('answered');
    expect(result.kept.length).toBe(1);
  });

  it('drops a sentence with no citation', () => {
    const result = verifyAnswer('Room rent is covered up to 2% of the sum insured.', supplied);
    expect(result.status).toBe('not-found');
    expect(result.dropped[0].reason).toBe('no-citation');
  });

  it('drops a citation we never supplied', () => {
    const result = verifyAnswer('Room rent is covered up to 2% of the sum insured [S99].', supplied);
    expect(result.dropped[0].reason).toBe('unknown-id');
  });

  it('drops a sentence whose number is not in the cited text', () => {
    const result = verifyAnswer('Cataract is covered up to 50% of the sum insured per eye [S7].', supplied);
    expect(result.dropped[0].reason).toBe('number-mismatch');
  });

  it('accepts the same amount written differently', () => {
    const result = verifyAnswer('Cataract treatment is limited to 25% of sum insured or Rs 40000 per eye [S7].', supplied);
    expect(result.status).toBe('answered');
  });

  it('accepts years written as months', () => {
    const result = verifyAnswer('Pre-existing disease treatment is excluded for 3 years of continuous coverage [S9].', supplied);
    expect(result.status).toBe('answered');
  });

  it('accepts number words in the source', () => {
    const result = verifyAnswer('The grace period for renewal is 30 days [S12].', supplied);
    expect(result.status).toBe('answered');
  });

  it('drops a sentence that cites the wrong passage', () => {
    const result = verifyAnswer('The grace period applies to renewal premium payment [S5].', supplied);
    expect(result.dropped[0].reason).toBe('low-overlap');
  });

  it('drops a "not" claim when the source has no negative words', () => {
    const result = verifyAnswer('Cataract treatment is not covered by the Company [S7].', supplied);
    expect(result.dropped[0].reason).toBe('negation-mismatch');
  });

  it('keeps a "not" claim when the source says excluded', () => {
    const result = verifyAnswer('Infertility treatment is not covered; sterility and infertility expenses are excluded [S20].', supplied);
    expect(result.status).toBe('answered');
  });

  it('drops a bare "Yes" because it says nothing checkable', () => {
    const result = verifyAnswer('Yes [S7]. Cataract treatment is covered up to 25% of the sum insured [S7].', supplied);
    expect(result.kept.length).toBe(1);
    expect(result.dropped[0].reason).toBe('too-vague');
  });

  it('returns not-found when the model says NOT FOUND', () => {
    const result = verifyAnswer('NOT FOUND', supplied);
    expect(result.status).toBe('not-found');
    expect(result.modelSaidNotFound).toBe(true);
  });

  it('keeps good sentences and drops bad ones in the same answer', () => {
    const answer = 'Cataract is covered up to 25% of the sum insured [S7]. It also pays Rs. 1,00,000 for glasses [S7].';
    const result = verifyAnswer(answer, supplied);
    expect(result.kept.length).toBe(1);
    expect(result.dropped.length).toBe(1);
  });
});

describe('verifyAnswer with heading context', () => {
  const withContext = new Map([
    ['S283', { text: '7.19 Treatment taken outside the geographical limits of India', context: '7 EXCLUSIONS' }],
    ['S236', { text: "a. The Landlord may give at least 1 year's written notice, as per Article 6E of the Law.", context: 'Periodic Tenancy F.4. Ending Tenancy Without Giving a Reason During' }],
  ]);

  it('uses a section heading like "EXCLUSIONS" for a "not covered" claim', () => {
    const result = verifyAnswer('Treatment taken outside India is not covered [S283].', withContext);
    expect(result.status).toBe('answered');
  });

  it('uses the clause heading for key words', () => {
    const result = verifyAnswer("The landlord must give at least 1 year's written notice to end a periodic tenancy without a reason [S236].", withContext);
    expect(result.status).toBe('answered');
  });

  it('never takes numbers from the heading', () => {
    const result = verifyAnswer('Treatment outside India is excluded under section 7 [S283].', withContext);
    expect(result.dropped[0].reason).toBe('number-mismatch');
  });

  it('treats "the document does not mention" as a refusal', () => {
    const result = verifyAnswer('The document does not mention stock options [S283].', withContext);
    expect(result.status).toBe('not-found');
    expect(result.dropped[0].reason).toBe('says-not-found');
  });

  it('accepts American spelling against British text', () => {
    const map = new Map([['S1', 'Expenses incurred on road Ambulance subject to a maximum of Rs.2000/- per hospitalisation.']]);
    const result = verifyAnswer('Road ambulance is paid up to a maximum of Rs.2000 per hospitalization [S1].', map);
    expect(result.status).toBe('answered');
  });
});

describe('verifyAnswer: "This / It" sentences and related answers', () => {
  const map = new Map([
    ['S326', 'Each and every claim under the Policy shall be subject to a Co-payment of 5% applicable to claim amount admissible and payable.'],
    ['S327', 'The amount payable shall be after deduction of the copayment.'],
    ['S340', 'All claims under the policy shall be payable in Indian currency only.'],
    ['S41', 'You will be on probation for a period of 6 months from your date of joining.'],
    ['S42', 'The probation period may be extended by up to 3 more months if your performance needs improvement.'],
    ['S51', 'You may occasionally be part of an on-call rotation; on-call weeks are compensated at Rs. 4,000 per week.'],
  ]);

  it('drops "This applies…" when its proof is about something else', () => {
    const answer = 'You must pay a co-payment of 5% on the claim amount [S326]. This applies to all claims under the policy [S340].';
    const result = verifyAnswer(answer, map);
    expect(result.kept.length).toBe(1);
    expect(result.dropped[0].reason).toBe('off-topic-link');
  });

  it('keeps "It may be extended…" when its proof is on the same topic', () => {
    const answer = 'The probation period is 6 months from your date of joining [S41]. It may be extended by up to 3 more months [S42].';
    expect(verifyAnswer(answer, map).kept.length).toBe(2);
  });

  it('keeps "This amount…" when the proof shares key words', () => {
    const answer = 'You must pay a co-payment of 5% on the claim amount [S326]. This amount is deducted from the sum payable [S327].';
    expect(verifyAnswer(answer, map).kept.length).toBe(2);
  });

  it('says "related" when the model says not found but a related line passes', () => {
    const answer = 'On-call weeks are compensated at Rs. 4,000 per week [S51]. There is no mention of extra pay for overtime.';
    const result = verifyAnswer(answer, map);
    expect(result.status).toBe('related');
    expect(result.kept.length).toBe(1);
  });
});

describe('verifyAnswer: right number, wrong thing', () => {
  const map = new Map([
    ['S639', { text: "i. The policyholder may cancel this policy by giving 15 days' written notice and in", context: '' }],
    ['S2053', { text: 'a. Expenses related to the treatment of any illness within 30 days from the first policy commencement date shall be excluded except claims arising due to an accident.', context: '3. 30-day waiting period' }],
    ['S41', { text: 'You will be on probation for a period of 6 months from your date of joining.', context: '5. Probation' }],
    ['S2040', { text: 'Pre-existing diseases are covered after the number of months specified in the Policy Schedule.', context: '1. Pre-Existing Diseases' }],
    ['S208', { text: 'Spectacles, Hearing aids & other Expenses', context: '6. EXCLUSIONS (Refer to the policy wordings)' }],
  ]);

  it('drops a number that belongs to a different subject', () => {
    const answer = 'You must give 15 days written notice for a reimbursement claim under this policy [S639].';
    const result = verifyAnswer(answer, map, { question: 'Within how many days must I file a reimbursement claim?' });
    expect(result.dropped[0].reason).toBe('number-wrong-subject');
  });

  it('drops "30 days" for pre-existing diseases when the proof is about first-30-days illness', () => {
    const answer = 'The waiting period for pre-existing diseases is 30 days from the first policy commencement date [S2053].';
    const result = verifyAnswer(answer, map, { question: 'How many months is the waiting period for pre-existing diseases?' });
    expect(result.status).toBe('not-found');
  });

  it('keeps a number that sits next to the subject', () => {
    const answer = 'The probation period is 6 months from your date of joining [S41].';
    const result = verifyAnswer(answer, map, { question: 'How long is the probation period?' });
    expect(result.status).toBe('answered');
  });

  it('drops "covered" when the proof is in an exclusions section', () => {
    const answer = 'Spectacles, hearing aids and other expenses are covered under the policy [S208].';
    const result = verifyAnswer(answer, map, { question: 'Are spectacles and hearing aids covered?' });
    expect(result.dropped[0].reason).toBe('exclusion-conflict');
  });

  it('treats "no specific limit is stated" as a refusal, not a fact', () => {
    const answer = 'There is no specific limit stated for leave not due [S41].';
    const result = verifyAnswer(answer, map, { question: 'What is the maximum leave not due?' });
    expect(result.dropped[0].reason).toBe('says-not-found');
  });
});

describe('verifyAnswer: "do so" points back', () => {
  it('drops "If you fail to do so…" when its proof is about something else', () => {
    const map = new Map([
      ['S12', 'Claims must be filed within 15 days of discharge.'],
      ['S5', 'If you find any discrepancy, please inform us within 15 days from the date of receipt of the policy, failing which the details would be taken as correct.'],
    ]);
    const answer = 'Claims must be filed within 15 days of discharge [S12]. If you fail to do so, the details would be taken as correct [S5].';
    const result = verifyAnswer(answer, map, { question: 'Within how many days must I file a claim?' });
    expect(result.kept.length).toBe(1);
  });
});

describe('verifyAnswer: repeated sentences', () => {
  it('shows a sentence the model repeated only once', () => {
    const map = new Map([['S1', 'The grace period for renewal is thirty days.']]);
    const answer = 'The grace period for renewal is 30 days [S1]. The grace period for renewal is 30 days [S1].';
    expect(verifyAnswer(answer, map).kept.length).toBe(1);
  });
});
