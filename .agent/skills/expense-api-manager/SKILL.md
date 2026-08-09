---
description: You are an Expense API Manager skill. Use this to automatically extract or add expenses via the backend FastAPI REST endpoints.
---

# Expense API Manager

This skill allows you to programmatically manage expenses using the secure personal REST API endpoints. This is useful when you need to bulk import expenses, read the latest transactions, or update existing records directly from the database without going through the web UI frontend.

## Authentication Setup
All endpoints require a `X-Personal-Token` header.
- **Header Name:** `X-Personal-Token`
- **Retrieval:** If you do not have the token, you must request it from the user or check the `.env.local` or environment configurations to authorize these API calls.

## API Endpoints Reference
The base URL for the API is `https://cashflow-eu-487122773776.europe-west4.run.app` (or `http://localhost:8000` if running locally).
All expense endpoints are prefixed with `/api/expenses/`.

### 1. Extract All Expenses (GET)
Retrieve the complete list of logged expenses.
- **Method:** `GET`
- **URL:** `/api/expenses/`
- **cURL Example:**
  ```bash
  curl -X GET "https://cashflow-eu-487122773776.europe-west4.run.app/api/expenses/" \
       -H "X-Personal-Token: <YOUR_TOKEN>"
  ```

### 2. Add an Expense (POST)
Add a single new expense to the backend.
- **Method:** `POST`
- **URL:** `/api/expenses/`
- **Content-Type:** `application/json`
- **Payload Schema:**
  ```json
  {
    "name": "string",
    "amount": "float",
    "category": "string (Housing, Food, Transport, Utilities, Entertainment, Other)",
    "is_recurring": "boolean",
    "created_at": "optional iso format datetime string"
  }
  ```
- **cURL Example:**
  ```bash
  curl -X POST "https://cashflow-eu-487122773776.europe-west4.run.app/api/expenses/" \
       -H "X-Personal-Token: <YOUR_TOKEN>" \
       -H "Content-Type: application/json" \
       -d '{"name": "Coffee", "amount": 4.50, "category": "Food", "is_recurring": false}'
  ```
- **cURL Example (With Specific Date):**
  ```bash
  curl -X POST "https://cashflow-eu-487122773776.europe-west4.run.app/api/expenses/" \
       -H "X-Personal-Token: <YOUR_TOKEN>" \
       -H "Content-Type: application/json" \
       -d '{"name": "Flight Ticket", "amount": 450.00, "category": "Transport", "is_recurring": false, "created_at": "2023-12-01T08:00:00Z"}'
  ```

### 3. Update an Expense (PUT)
Modify specific fields of an existing expense using its `<uuid>`.
- **Method:** `PUT`
- **URL:** `/api/expenses/<uuid>`
- **Content-Type:** `application/json`
- **Payload:** Send only the fields to modify.
- **cURL Example:**
  ```bash
  curl -X PUT "https://cashflow-eu-487122773776.europe-west4.run.app/api/expenses/<uuid>" \
       -H "X-Personal-Token: <YOUR_TOKEN>" \
       -H "Content-Type: application/json" \
       -d '{"amount": 5.00}'
  ```

### 4. Delete an Expense (DELETE)
Remove an expense entirely.
- **Method:** `DELETE`
- **URL:** `/api/expenses/<uuid>`
- **cURL Example:**
  ```bash
  curl -X DELETE "https://cashflow-eu-487122773776.europe-west4.run.app/api/expenses/<uuid>" \
       -H "X-Personal-Token: <YOUR_TOKEN>"
  ```

## Instructions for the Agent
1. When asked by the user to "extract expenses", "add a new expense via the API", or interact with the backend directly—activate this skill.
2. Formulate your requests accurately based strictly on the JSON schemas above.
3. Validate the categories against the strict enumeration (`Housing`, `Food`, `Transport`, `Utilities`, `Entertainment`, `Other`).
4. Always authenticate with the `X-Personal-Token` header. Provide raw outputs or summaries to the user as requested.
