# Cashflow Application Architecture & Flow

This flowchart visually explains how your application works, both locally and when deployed to Google Cloud Run. It illustrates the dual-role of FastAPI: as a static file server and as an API backend.

## Architecture Flowchart

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1E1E2E', 'primaryTextColor': '#C3CCCE', 'primaryBorderColor': '#7C3AED', 'lineColor': '#8B5CF6', 'secondaryColor': '#282A36', 'tertiaryColor': '#44475A'}}}%%
graph TD
    classDef user fill:#3B82F6,stroke:#2563EB,stroke-width:2px,color:#fff;
    classDef cloudRun fill:#10B981,stroke:#059669,stroke-width:2px,color:#fff;
    classDef fastapi fill:#8B5CF6,stroke:#7C3AED,stroke-width:2px,color:#fff;
    classDef react fill:#61DAFB,stroke:#38BDF8,stroke-width:2px,color:#1E1E2E,font-weight:bold;
    classDef extService fill:#F59E0B,stroke:#D97706,stroke-width:2px,color:#fff;
    classDef fileSystem fill:#4B5563,stroke:#374151,stroke-width:2px,color:#fff;

    %% User Interaction
    User((User Browser)):::user

    %% Google Cloud Run Infrastructure
    subgraph Google Cloud Run Infrastructure
        direction TB
        LB[Cloud Run Load Balancer<br><i>Listens on HTTPS Port 443</i>]:::cloudRun
        LB -- "$PORT Env Var<br>Injected by Google" --> Docker
        
        %% Docker Container
        subgraph Docker Container [Single Docker Container]
            direction TB
            Gunicorn[Gunicorn Process Manager<br><i>Binds to $PORT</i>]:::fastapi
            
            subgraph FastAPI App [FastAPI Application]
                direction LR
                HealthRouter["/health<br><i>Zero-dependency ping</i>"]:::fastapi
                StaticRouter["/{full_path:path}<br><i>Catch-all static files</i>"]:::fastapi
                APIRouter["/api/expenses...<br><i>Backend Logic</i>"]:::fastapi
            end
            
            %% File System inside Docker
            DistFolder[("dist/ Folder<br><i>Compiled React HTML/JS</i>")]:::fileSystem
        end
    end

    %% External Services
    Supabase[(Supabase<br>Database & Auth)]:::extService
    Gemini[Google Gemini AI]:::extService

    %% Connections - Phase 1: Loading the App
    User == "1. Visits https://cashflow...run.app" ==> LB
    LB == "2. Forwards to container" ==> Gunicorn
    Gunicorn -. "Health Check Ping" .-> HealthRouter
    Gunicorn --> StaticRouter
    StaticRouter -- "3. Reads from disk" --> DistFolder
    DistFolder -. "4. Returns index.html" .-> StaticRouter
    StaticRouter == "5. Sends React back to browser" ==> User

    %% Connections - Phase 2: Using the App
    React[React App<br><i>Running locally in Browser</i>]:::react
    User -- "Interacts with UI" --> React
    
    %% React API Calls
    React == "6. Creates Expense (POST /api/expenses)" ==> LB
    LB --> Gunicorn
    Gunicorn --> APIRouter
    APIRouter -- "7. Saves to DB" --> Supabase
    Supabase -. "8. Returns Success" .-> APIRouter
    APIRouter == "9. Sends JSON back" ==> React
    
    %% Direct React External Calls
    React -- "Direct Call (Sync Data)" --> Supabase
    React -- "Direct Call (AI Advice)" --> Gemini
```

## How It Works (Step-by-Step)

### Phase 1: The Initial Load (FastAPI as a Delivery Boy)
1. **The Request**: You open your browser and go to your Cloud Run URL.
2. **The Cloud**: Google Cloud Run's Load Balancer intercepts that request and passes it into your single Docker container via Gunicorn.
3. **The Catch-All**: The request hits FastAPI. Since it's not searching for `/health` or `/api/`, it falls into the greedy catch-all router (`@app.get("/{full_path:path}")`).
4. **The Disk Read**: FastAPI looks into the `dist/` folder sitting inside the Docker container, finds `index.html`, and sends it all the way back to your browser.
5. **The Handoff**: Your browser downloads the Javascript and HTML. **The React application now lives locally on your computer.** 

### Phase 2: Using the App (FastAPI as a Smart Backend)
1. **The Action**: Inside the app (now running in your browser), you add an expense and click submit.
2. **The API Call**: The React javascript fires a background `fetch` request back across the internet to the specific endpoint: `/api/expenses/bulk`.
3. **The Logic**: Google Cloud Run routes this to FastAPI. The `/api/` router intercepts it, validates the data, checks your X-Personal-Token, and talks securely to Supabase.
4. **The Response**: FastAPI returns a JSON status code. Your React frontend reads the JSON and updates the UI on your screen.

*Note: For many other features (like the FIRE Calculator or fetching Gemini advice), React skips FastAPI entirely and just talks directly to those services over the internet using the browser!*
