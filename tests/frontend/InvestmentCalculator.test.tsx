import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvestmentCalculator } from '../../components/InvestmentCalculator';
import { InvestmentState } from '../../types';

/** Reference implementation of the same compounding the component performs. */
function expectedFinal(s: InvestmentState) {
  const months = s.yearsToGrow * 12;
  const monthlyRate = s.annualInterestRate / 100 / 12;
  let value = s.initialPrincipal;
  let invested = s.initialPrincipal;
  let lastValue = value;
  for (let i = 0; i <= months; i++) {
    if (i % 12 === 0) lastValue = parseFloat(value.toFixed(2));
    if (i < months) {
      value = (value + s.monthlyContribution) * (1 + monthlyRate);
      invested += s.monthlyContribution;
    }
  }
  return { final: lastValue, invested };
}

const euro0 = (n: number) => '€' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const noop = () => {};

describe('Investment calculator math', () => {
  it('compounds a lump sum correctly (100 @ 12%/yr, 1yr ≈ 112.68)', () => {
    const s: InvestmentState = { initialPrincipal: 100, monthlyContribution: 0, annualInterestRate: 12, yearsToGrow: 1 };
    const { final, invested } = expectedFinal(s);
    expect(final).toBeCloseTo(112.68, 2); // sanity on the reference itself

    render(<InvestmentCalculator investment={s} setInvestment={noop as any} />);
    expect(screen.getByText(euro0(final))).toBeInTheDocument();      // Final Value
    expect(screen.getByText(euro0(invested))).toBeInTheDocument();   // Total Contributed (€100)
  });

  it('sums contributions with no growth (0 principal, 100/mo, 0%, 1yr = 1200)', () => {
    const s: InvestmentState = { initialPrincipal: 0, monthlyContribution: 100, annualInterestRate: 0, yearsToGrow: 1 };
    const { final, invested } = expectedFinal(s);
    expect(final).toBe(1200);
    expect(invested).toBe(1200);

    render(<InvestmentCalculator investment={s} setInvestment={noop as any} />);
    // Final value and contributed are identical (no interest) -> appears for both cards
    expect(screen.getAllByText(euro0(final)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('+' + euro0(final - invested))).toBeInTheDocument(); // +€0 interest
  });
});
