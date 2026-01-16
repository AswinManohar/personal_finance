import React, { useState } from 'react';
import { Expense, InvestmentState, SavingsGoal, FIREState, PortfolioAsset, IncomeState, Stock, NetWorthState } from '../types';
import { getFinancialAdvice } from '../services/geminiService';
import { Card } from './ui/Card';
import { Sparkles, Bot, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface AIAdvisorProps {
  expenses: Expense[];
  investment: InvestmentState;
  goal: SavingsGoal;
  fire: FIREState;
  portfolio: PortfolioAsset[];
  stocks: Stock[];
  income: IncomeState;
  netWorthData: NetWorthState;
}

export const AIAdvisor: React.FC<AIAdvisorProps> = ({ expenses, investment, goal, fire, portfolio, stocks, income, netWorthData }) => {
  const [advice, setAdvice] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getFinancialAdvice(expenses, investment, goal, fire, portfolio, stocks, income, netWorthData);
      setAdvice(result);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const components = {
    h1: ({node, ...props}: any) => <h1 className="text-2xl font-bold text-slate-900 mb-4" {...props} />,
    h2: ({node, ...props}: any) => <h2 className="text-xl font-bold text-slate-800 mt-6 mb-3" {...props} />,
    h3: ({node, ...props}: any) => <h3 className="text-lg font-bold text-slate-800 mt-4 mb-2" {...props} />,
    p: ({node, ...props}: any) => <p className="text-slate-600 mb-4 leading-relaxed" {...props} />,
    ul: ({node, ...props}: any) => <ul className="list-disc pl-5 space-y-2 mb-4 text-slate-600" {...props} />,
    li: ({node, ...props}: any) => <li className="" {...props} />,
    strong: ({node, ...props}: any) => <strong className="font-semibold text-slate-900" {...props} />,
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center justify-center gap-2">
          <Sparkles className="text-purple-500" /> AI Financial Advisor
        </h2>
        <p className="text-slate-500 mt-2">Get personalized insights powered by Gemini based on your current inputs.</p>
      </div>

      {!advice && !loading && (
        <div className="flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4">
            <Bot className="text-purple-600" size={32} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Ready to Analyze</h3>
          <p className="text-slate-500 max-w-md mb-6">
            Review your expenses, investments, gold holdings, and loans, then let our AI provide actionable tips to optimize your finances.
          </p>
          <button
            onClick={handleAnalyze}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full font-medium shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
          >
            <Sparkles size={18} /> Generate Insights
          </button>
        </div>
      )}

      {loading && (
        <Card>
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mb-4"></div>
            <p className="text-slate-600 animate-pulse">Analyzing your financial data...</p>
          </div>
        </Card>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-3 mb-6">
          <AlertCircle size={20} />
          <p>Something went wrong fetching the advice. Please check your connection and try again.</p>
        </div>
      )}

      {advice && !loading && (
        <Card className="border-purple-100 bg-white">
          <div className="prose prose-slate max-w-none p-2">
            <ReactMarkdown components={components}>{advice}</ReactMarkdown>
          </div>
          <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={handleAnalyze}
              className="text-sm text-purple-600 font-medium hover:text-purple-800 transition-colors"
            >
              Refresh Analysis
            </button>
          </div>
        </Card>
      )}
    </div>
  );
};