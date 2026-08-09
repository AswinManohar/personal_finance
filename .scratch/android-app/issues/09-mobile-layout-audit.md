# Mobile layout audit of all 10 screens at 390px

Type: task
Status: open
Blocked by: —

## Question

"All the functionality" means every screen is usable on a phone, not merely reachable. Responsive
coverage across the app is thin — 45 breakpoint usages total, distributed very unevenly:

| Component | `sm:`/`md:`/`lg:`/`xl:` usages |
|---|---|
| NetWorth | 11 |
| Portfolio | 7 |
| FIRECalculator | 5 |
| Debts | 5 |
| Expenses | 4 |
| App | 4 |
| Stocks | 3 |
| SavingsDashboard | 3 |
| InvestmentCalculator | 3 |
| **SavingsGoal** | **0** |
| **Login** | **0** |
| **DataManagement** | **0** |

Audit all 10 destinations plus Login at 390px wide and catalogue what actually breaks. Expect
wide data tables (Portfolio, Stocks, Debts), multi-column input grids in the calculators, Recharts
charts that do not reflow, and touch targets below 48dp.

`Login` and `SavingsGoal` have no responsive styling at all. `DataManagement` has none either and
is separately covered by "Data export and import inside the app shell".

Produce a per-screen list of concrete defects with severity, sorted so the fixes can be
prioritised — this ticket catalogues, it does not fix. Fixes graduate into their own tickets.
