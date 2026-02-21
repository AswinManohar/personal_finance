from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routers import expenses
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="FinanceFlow API")

# CORS Configuration
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(expenses.router)

@app.get("/")
async def root():
    return {"message": "Welcome to FinanceFlow API"}
