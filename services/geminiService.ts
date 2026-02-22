import { GoogleGenAI } from "@google/genai";
import { Expense, InvestmentState, SavingsGoal, FIREState, PortfolioAsset, IncomeState, Stock, NetWorthState } from "../types";

// Initialize lazily so the entire React app doesn't crash on boot if the API key is missing during Cloud Build
let aiClient: GoogleGenAI | null = null;
const getAIClient = () => {
  if (aiClient) return aiClient;
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey || apiKey === "undefined") {
      console.warn("Gemini API key is missing. AI features will be disabled.");
      return null;
    }
    aiClient = new GoogleGenAI({ apiKey: apiKey as string });
    return aiClient;
  } catch (e) {
    console.error("Failed to initialize Gemini Client:", e);
    return null;
  }
};

export interface StockPriceResult {
  prices: Record<string, number>;
  sources?: any[];
}

export const getStockPrices = async (symbols: string[]): Promise<StockPriceResult> => {
  if (symbols.length === 0) return { prices: {} };

  const prompt = `
    Find the current real-time stock price for the following ticker symbols: ${symbols.join(', ')}.
    If a symbol is ambiguous, assume a major US or Indian exchange.
    Provide the output in this specific plain text format for each symbol found:
    SYMBOL: PRICE
    Do not add any other text, markdown, or currency symbols. Just the ticker, a colon, and the numeric price.
  `;

  try {
    const ai = getAIClient();
    if (!ai) return { prices: {} };

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || "";
    const prices: Record<string, number> = {};
    const lines = text.split('\n');
    lines.forEach(line => {
      const match = line.match(/([A-Z0-9.]+):\s*([\d,.]+)/i);
      if (match) {
        const symbol = match[1].toUpperCase().trim();
        const price = parseFloat(match[2].replace(/,/g, ''));
        if (!isNaN(price)) {
          prices[symbol] = price;
        }
      }
    });

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    return { prices, sources };
  } catch (error) {
    console.error("Error fetching stock prices:", error);
    return { prices: {} };
  }
};

export const getFinancialAdvice = async (
  expenses: Expense[],
  investment: InvestmentState,
  goal: SavingsGoal,
  fire: FIREState,
  portfolio: PortfolioAsset[],
  stocks: Stock[],
  income?: IncomeState,
  netWorthData?: NetWorthState
): Promise<string> => {
  try {
    const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
    const fireNumber = fire.annualExpenses / (fire.withdrawalRate / 100);

    const portfolioTotalValue = portfolio.reduce((sum, p) => sum + p.currentValue, 0);
    const stocksTotalValue = stocks.reduce((sum, s) => sum + (s.quantity * (s.currentPrice || s.buyPrice)), 0);

    let netWorthSection = '';
    if (netWorthData) {
      const totalAssets = goal.currentSavings + portfolioTotalValue + stocksTotalValue + netWorthData.goldInvestment;
      const actualNetWorth = totalAssets - netWorthData.remainingLoan;
      netWorthSection = `
      7. Comprehensive Net Worth Breakdown:
      - Total Assets: €${totalAssets.toFixed(2)}
      - Liquid Cash (Savings): €${goal.currentSavings}
      - Physical Gold: €${netWorthData.goldInvestment}
      - Liabilities (Remaining Loans): €${netWorthData.remainingLoan}
      - Calculated Net Worth: €${actualNetWorth.toFixed(2)}
      `;
    }

    const prompt = `
      Act as a world-class financial advisor. I will provide you with my current financial data. 
      Please analyze it and provide 3-4 specific, actionable, and encouraging bullet points on how to improve my financial health.
      
      My Financial Data:
      ${netWorthSection}
      
      1. Monthly Expenses: Total €${totalExpenses.toFixed(2)}
      2. General Investment Plan: €${investment.initialPrincipal} initial, €${investment.monthlyContribution} monthly.
      3. Portfolio (Funds/ETFs) Value: €${portfolioTotalValue}
      4. Stock Portfolio Value: €${stocksTotalValue.toFixed(2)}
      5. Savings Goal Target: €${goal.targetAmount}
      6. FIRE Target: €${fireNumber.toFixed(0)}
      
      Provide holistic advice. Specifically comment on my debt-to-asset ratio and physical gold holdings compared to market investments.
      If my net worth is negative due to loans, suggest a debt payoff strategy. 
      Check for diversification and suggest improvements. Format the response in Markdown.
    `;

    const ai = getAIClient();
    if (!ai) return "AI services are currently offline because the API key is not configured.";

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 0 } }
    });

    return response.text || "Unable to generate advice at this time.";
  } catch (error) {
    console.error("Error fetching financial advice:", error);
    return "Sorry, I encountered an error while analyzing your finances.";
  }
};