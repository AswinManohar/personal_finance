from pydantic import BaseModel, Field
from typing import Optional, List, Union
from enum import Enum
from datetime import datetime

class ExpenseCategory(str, Enum):
    HOUSING = 'Housing'
    FOOD = 'Food'
    TRANSPORT = 'Transport'
    UTILITIES = 'Utilities'
    ENTERTAINMENT = 'Entertainment'
    OTHER = 'Other'

class RecurringFrequency(str, Enum):
    WEEKLY = 'weekly'
    BI_WEEKLY = 'bi-weekly'
    MONTHLY = 'monthly'
    QUARTERLY = 'quarterly'
    YEARLY = 'yearly'

class ExpenseBase(BaseModel):
    name: str = Field(..., min_length=1, description="Name of the expense")
    amount: float = Field(..., gt=0, description="Amount of the expense")
    category: ExpenseCategory = Field(default=ExpenseCategory.OTHER, description="Category of the expense")
    vendor: Optional[str] = Field(default=None, description="Merchant/vendor, e.g. 'REWE', 'Lieferando'")
    is_recurring: bool = Field(default=False, description="Whether the expense is recurring")
    recurring_frequency: Optional[RecurringFrequency] = Field(
        default=None, description="Cadence of a recurring expense (only set when is_recurring is true)"
    )

class ExpenseCreate(ExpenseBase):
    created_at: Optional[datetime] = Field(default=None, description="Date of the expense")

class ExpenseUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, description="Name of the expense")
    amount: Optional[float] = Field(default=None, gt=0, description="Amount of the expense")
    category: Optional[ExpenseCategory] = Field(default=None, description="Category of the expense")
    vendor: Optional[str] = Field(default=None, description="Merchant/vendor")
    is_recurring: Optional[bool] = Field(default=None, description="Whether the expense is recurring")
    recurring_frequency: Optional[RecurringFrequency] = Field(default=None, description="Cadence of a recurring expense")
    created_at: Optional[datetime] = Field(default=None, description="Date of the expense")

class Expense(ExpenseBase):
    id: Optional[str] = None
    user_key: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Integration (Life OS) response models -------------------------------------

class IntegrationExpense(BaseModel):
    """An active expense as exposed to read-only integrations."""
    id: str
    name: str
    amount: float
    category: str
    vendor: Optional[str] = None
    isRecurring: bool = False
    recurringFrequency: Optional[str] = None
    date: Optional[str] = Field(default=None, description="ISO 8601 date/time of the expense (timezone-aware)")
    updated_at: Optional[str] = Field(default=None, description="ISO 8601 last-modified timestamp; cursor source")
    deleted: bool = False

class IntegrationExpenseTombstone(BaseModel):
    """A deleted expense — only the id, the tombstone flag, and when it happened."""
    id: str
    deleted: bool = True
    updated_at: Optional[str] = None

class ExpensesFeed(BaseModel):
    data: List[Union[IntegrationExpense, IntegrationExpenseTombstone]]
    next_cursor: Optional[str] = Field(
        default=None, description="Opaque cursor to pass as ?since= on the next pull; null when caught up"
    )

class SavingsHistoryFeed(BaseModel):
    data: List[dict]
    next_cursor: Optional[str] = None

class IncomeSnapshot(BaseModel):
    salaryMe: float = 0
    salaryPartner: float = 0
    updatedAt: Optional[str] = None
