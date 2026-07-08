/**
 * deidentifyFreeText unit test — H6 regression coverage.
 *
 * Known-identifier literals (patient name / account number / member ID) plus
 * the DOB and street-address pattern classes must all come out redacted;
 * clean prose must pass through untouched.
 */
import { describe, it, expect } from 'vitest';
import { deidentifyFreeText } from '../ai/phiBoundary';

describe('deidentifyFreeText — known identifier literals', () => {
  it('scrubs a supplied patient name (case-insensitive)', () => {
    const r = deidentifyFreeText('I told them BRECKEN LOHMAN never had this test. brecken lohman disputes it.', {
      patientName: 'Brecken Lohman',
    });
    expect(r.text).not.toMatch(/brecken/i);
    expect(r.text).toContain('[PATIENT NAME]');
    expect(r.redactions).toBe(2);
  });

  it('scrubs a supplied alphanumeric account number the shape patterns miss', () => {
    const r = deidentifyFreeText('my account F00010479293 was double billed', {
      accountNumber: 'F00010479293',
    });
    expect(r.text).toContain('[ACCOUNT NUMBER]');
    expect(r.text).not.toContain('F00010479293');
  });

  it('ignores too-short identifiers so prose is not shredded', () => {
    const r = deidentifyFreeText('already paid the bill', { patientName: 'Al' });
    expect(r.text).toBe('already paid the bill');
  });
});

describe('deidentifyFreeText — DOB pattern', () => {
  it('redacts labeled birth dates', () => {
    expect(deidentifyFreeText('patient DOB 3/4/1980 was billed twice').text).not.toContain('3/4/1980');
    expect(deidentifyFreeText('date of birth: 03-04-1980').text).not.toContain('03-04-1980');
    expect(deidentifyFreeText('she was born 1980-03-04').text).not.toContain('1980-03-04');
  });

  it('leaves unlabeled dates (service dates) alone', () => {
    const r = deidentifyFreeText('the visit on 3/14/2025 was cancelled');
    expect(r.text).toContain('3/14/2025');
    expect(r.redactions).toBe(0);
  });
});

describe('deidentifyFreeText — street address pattern', () => {
  it('redacts street addresses', () => {
    expect(deidentifyFreeText('bills sent to 669 Buffalo Trl instead').text).not.toContain('669 Buffalo Trl');
    expect(deidentifyFreeText('I live at 401 Park Ave now').text).not.toContain('401 Park Ave');
    expect(deidentifyFreeText('sent to 12 North Main Street again').text).not.toContain('12 North Main Street');
  });
});

describe('deidentifyFreeText — clean text', () => {
  it('passes clean text through unchanged', () => {
    const clean =
      'The CT scan on line 4 was cancelled before it happened, but CPT 74177 still shows $2,100.';
    const r = deidentifyFreeText(clean);
    expect(r.text).toBe(clean);
    expect(r.redactions).toBe(0);
  });
});

describe('deidentifyFreeText — acceptance combo (H6)', () => {
  it('redacts name, account number, DOB, and street address together', () => {
    const r = deidentifyFreeText(
      'This is Jane Smith, call 406-555-1234, account F00010479293, DOB 3/4/1980, I live at 669 Buffalo Trl.',
      { patientName: 'Jane Smith', accountNumber: 'F00010479293' }
    );
    expect(r.text).not.toContain('Jane Smith');
    expect(r.text).not.toContain('406-555-1234');
    expect(r.text).not.toContain('F00010479293');
    expect(r.text).not.toContain('3/4/1980');
    expect(r.text).not.toContain('669 Buffalo Trl');
    expect(r.text).toContain('[PATIENT NAME]');
    expect(r.text).toContain('[PHONE]');
    expect(r.text).toContain('[ACCOUNT NUMBER]');
    expect(r.text).toContain('[REDACTED]');
  });
});
