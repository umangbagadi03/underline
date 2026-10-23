// Exclusion check: an answer must not say something "is covered" when its proof is an exclusion.
// Example of what this catches:
//   Answer: "Spectacles and hearing aids are covered [S208]."
//   S208 is an item in the "Specific Exclusions" list, so the sentence is dropped.

import { saysNot } from './words.js';

// The answer claims cover: "is covered", "are payable", "will pay", "will reimburse"…
const SAYS_COVERED = /\b(?:is|are)\s+(?:also\s+)?(?:covered|payable|reimbursed|included|admissible)\b|\bwill\s+(?:be\s+)?(?:pay|cover|reimburse)/i;

// The proof (or its heading) is about exclusions.
const EXCLUSION = /\bexclu(?:sion|sions|ded|des)\b|\bnot\s+(?:covered|payable|admissible)\b/i;

// "Covered after a 24-month waiting period" is fine even inside an exclusions section.
const AFTER_WAITING = /\b(?:after|waiting|wait)\b/i;

/** True if the claim says "covered" but its proof is about exclusions. */
export function claimsCoverOfExclusion(claim, proofWithHeadings) {
  if (saysNot(claim)) return false;
  if (!SAYS_COVERED.test(claim)) return false;
  if (AFTER_WAITING.test(claim)) return false;
  return EXCLUSION.test(proofWithHeadings);
}
