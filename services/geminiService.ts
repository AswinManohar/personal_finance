import { GoogleGenAI } from "@google/genai";
import { Expense, InvestmentState, SavingsGoal, FIREState, PortfolioAsset, IncomeState, Stock } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getStockPrices = async (symbols: string[]): Promise<Record<string, number>> => {
  if (symbols.length === 0) return {};

  const prompt = `
    Find the current real-time stock price for the following ticker symbols: ${symbols.join(', ')}.
    
    If a symbol is ambiguous, assume a major US or Indian exchange.
    
    Provide the output in this specific plain text format for each symbol found:
    SYMBOL: PRICE
    
    Example:
    AAPL: 150.25
    RELIANCE: 2400.50
    
    Do not add any other text, markdown, or currency symbols. Just the ticker, a colon, and the numeric price.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || "";
    const prices: Record<string, number> = {};
    
    // Parse the output
    const lines = text.split('\n');
    lines.forEach(line => {
      // Regex to capture SYMBOL: PRICE (allowing for potential commas in price e.g. 2,400.00)
      const match = line.match(/([A-Z0-9.]+):\s*([\d,.]+)/i);
      if (match) {
        const symbol = match[1].toUpperCase().trim();
        // Remove commas from price before parsing
        const price = parseFloat(match[2].replace(/,/g, ''));
        if (!isNaN(price)) {
          prices[symbol] = price;
        }
      }
    });

    return prices;
  } catch (error) {
    console.error("Error fetching stock prices:", error);
    return {};
  }
};

export const getFinancialAdvice = async (
  expenses: Expense[],
  investment: InvestmentState,
  goal: SavingsGoal,
  fire: FIREState,
  portfolio: PortfolioAsset[],
  stocks: Stock[],
  income?: IncomeState
): Promise<string> => {
  try {
    const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
    const fireNumber = fire.annualExpenses / (fire.withdrawalRate / 100);
    
    // Process Portfolio Data
    const portfolioTotalValue = portfolio.reduce((sum, p) => sum + p.currentValue, 0);
    const portfolioMonthly = portfolio.reduce((sum, p) => sum + p.monthlyInvestment, 0);
    const portfolioBreakdown = portfolio.map(p => 
      `- ${p.name} (${p.type}): Val: €${p.currentValue}, Monthly: €${p.monthlyInvestment}`
    ).join('\n');

    // Process Stock Data
    let stocksTotalValue = 0;
    let stocksTotalCost = 0;
    const stocksBreakdown = stocks.map(s => {
      const currentVal = s.currentPrice ? s.currentPrice * s.quantity : s.buyPrice * s.quantity; // Fallback to buy price if current missing
      stocksTotalValue += currentVal;
      stocksTotalCost += s.buyPrice * s.quantity;
      const gain = currentVal - (s.buyPrice * s.quantity);
      return `- ${s.symbol}: ${s.quantity} shares @ buy ${s.buyPrice}, curr ${s.currentPrice || 'N/A'}. Val: ${currentVal.toFixed(2)} (Gain: ${gain.toFixed(2)})`;
    }).join('\n');

    let incomeSection = '';
    if (income) {
      const totalIncome = income.salaryMe + income.salaryPartner;
      const remaining = totalIncome - totalExpenses;
      incomeSection = `
      0. Income Overview:
      - My Salary: €${income.salaryMe}
      - Partner's Salary: €${income.salaryPartner}
      - Total Monthly Income: €${totalIncome}
      - Monthly Surplus (Income - Expenses): €${remaining}
      `;
    }

    const prompt = `
      Act as a world-class financial advisor. I will provide you with my current financial data. 
      Please analyze it and provide 3-4 specific, actionable, and encouraging bullet points on how to improve my financial health.
      
      My Financial Data:
      ${incomeSection}
      
      1. Monthly Expenses: Total €${totalExpenses.toFixed(2)}
      Breakdown:
      ${expenses.map(e => `- ${e.name} (${e.category}): €${e.amount}`).join('\n')}
      
      2. General Investment Plan:
      - Initial Principal: €${investment.initialPrincipal}
      - Monthly Contribution: €${investment.monthlyContribution}
      
      3. Portfolio (Funds/ETFs):
      - Total Value: €${portfolioTotalValue}
      - Assets:
      ${portfolioBreakdown || "None"}
      
      4. Stock Portfolio (Direct Equity):
      - Total Current Value: €${stocksTotalValue.toFixed(2)}
      - Total Cost Basis: €${stocksTotalCost.toFixed(2)}
      - Unrealized P&L: €${(stocksTotalValue - stocksTotalCost).toFixed(2)}
      - Holdings:
      ${stocksBreakdown || "None"}
      
      5. Savings Goal:
      - Target: €${goal.targetAmount}
      - Current Saved: €${goal.currentSavings}
      
      6. FIRE Plan:
      - Target FIRE Number: €${fireNumber.toFixed(0)}
      - Current Net Worth (User Input): €${fire.currentNetWorth}
      
      Provide holistic advice. Specifically comment on the diversification between the Funds/ETFs and the individual Stock picks.
      Check if the stock portfolio is too risky compared to the safer funds.
      Keep the tone professional yet accessible. Format the response in Markdown.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 } 
      }
    });

    return response.text || "Unable to generate advice at this time.";
  } catch (error) {
    console.error("Error fetching financial advice:", error);
    return "Sorry, I encountered an error while analyzing your finances. Please try again later.";
  }
};