# Updating Expenses via the API

Your FastAPI backend features secure REST endpoints tailored for managing expenses. While your main React frontend primarily communicates with Supabase, you can interact with these endpoints directly using your `PERSONAL_API_TOKEN`. This is perfect for automation, scripts, or integrating with other services.

## Authentication

To use these endpoints securely from outside the React app, you must authenticate using your personal API token.

*   **Header Name:** `X-Personal-Token`
*   **Header Value:** `<YOUR_PERSONAL_API_TOKEN>`

*Note: For this to work, both `PERSONAL_API_TOKEN` and `PERSONAL_USER_ID` must be configured as environment variables in your Google Cloud Run instance.*

## Endpoints

All expense endpoints are prefixed with `/api/expenses`. Replace `https://cashflow-487122773776.us-west1.run.app` with your actual Cloud Run URL.

### 1. Get All Expenses

Retrieve a list of all expenses associated with your account.

*   **Method:** `GET`
*   **URL:** `https://cashflow-487122773776.us-west1.run.app/api/expenses/`

**cURL Example:**
```bash
curl -X GET "https://cashflow-487122773776.us-west1.run.app/api/expenses/" \
     -H "X-Personal-Token: your_secret_token_here"
```

### 2. Create a New Expense

Add a single new expense to your account.

*   **Method:** `POST`
*   **URL:** `https://cashflow-487122773776.us-west1.run.app/api/expenses/`
*   **Content-Type:** `application/json`

**Required Payload Structure:**
```json
{
  "name": "Groceries",
  "amount": 150.50,
  "category": "Food",
  "is_recurring": false
}
```
*Valid categories are: `Housing`, `Food`, `Transport`, `Utilities`, `Entertainment`, `Other`.*

**cURL Example:**
```bash
curl -X POST "https://cashflow-487122773776.us-west1.run.app/api/expenses/" \
     -H "X-Personal-Token: your_secret_token_here" \
     -H "Content-Type: application/json" \
     -d '{"name": "Internet Bill", "amount": 80.00, "category": "Utilities", "is_recurring": true}'
```

### 3. Update an Existing Expense

Modify specific fields of an existing expense. You need the expense's unique `id`.

*   **Method:** `PUT`
*   **URL:** `https://cashflow-487122773776.us-west1.run.app/api/expenses/{expense_id}`
*   **Content-Type:** `application/json`

**Optional Payload Structure:** You only need to include the fields you want to change.
```json
{
  "amount": 85.00
}
```

**cURL Example:**
```bash
curl -X PUT "https://cashflow-487122773776.us-west1.run.app/api/expenses/uuid-of-expense-here" \
     -H "X-Personal-Token: your_secret_token_here" \
     -H "Content-Type: application/json" \
     -d '{"amount": 85.00}'
```

### 4. Delete an Expense

Remove an expense from your account entirely using its `id`.

*   **Method:** `DELETE`
*   **URL:** `https://cashflow-487122773776.us-west1.run.app/api/expenses/{expense_id}`

**cURL Example:**
```bash
curl -X DELETE "https://cashflow-487122773776.us-west1.run.app/api/expenses/uuid-of-expense-here" \
     -H "X-Personal-Token: your_secret_token_here"
```
