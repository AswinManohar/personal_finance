from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime

class ExpenseCategory(str, Enum):
    HOUSING = 'Housing'
    FOOD = 'Food'
    TRANSPORT = 'Transport'
    UTILITIES = 'Utilities'
    ENTERTAINMENT = 'Entertainment'
    OTHER = 'Other'

class ExpenseBase(BaseModel):
    name: str = Field(..., min_length=1, description="Name of the expense")
    amount: float = Field(..., gt=0, description="Amount of the expense")
    category: ExpenseCategory = Field(default=ExpenseCategory.OTHER, description="Category of the expense")
    is_recurring: bool = Field(default=False, description="Whether the expense is recurring")

class ExpenseCreate(ExpenseBase):
    pass

class ExpenseUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, description="Name of the expense")
    amount: Optional[float] = Field(default=None, gt=0, description="Amount of the expense")
    category: Optional[ExpenseCategory] = Field(default=None, description="Category of the expense")
    is_recurring: Optional[bool] = Field(default=None, description="Whether the expense is recurring")

class Expense(ExpenseBase):
    id: Optional[str] = None
    user_key: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
