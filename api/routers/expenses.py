from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from api.dependencies import get_supabase_client, get_current_user_id
from api.models import Expense, ExpenseCreate, ExpenseUpdate

router = APIRouter(
    prefix="/expenses",
    tags=["expenses"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=List[Expense], operation_id="get_expenses")
async def read_expenses(user_id: str = Depends(get_current_user_id)):
    """
    Get all expenses for the current user.
    """
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client is not configured")
        response = supabase.table("user_expenses").select("*").eq("user_key", user_id).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=Expense, status_code=status.HTTP_201_CREATED)
async def create_expense(expense: ExpenseCreate, user_id: str = Depends(get_current_user_id)):
    """
    Create a new expense for the current user.
    """
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client is not configured")
        # Prepare data matching the table schema
        data = expense.model_dump()
        data["user_key"] = user_id
        
        # Insert into Supabase
        response = supabase.table("user_expenses").insert(data).execute()
        
        if response.data and len(response.data) > 0:
            return response.data[0]
        else:
            raise HTTPException(status_code=500, detail="Failed to create expense")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{expense_id}", response_model=Expense, operation_id="update_expense")
async def update_expense(
    expense_id: str,
    expense: ExpenseUpdate,
    user_id: str = Depends(get_current_user_id),
):
    """
    Update an existing expense for the current user.
    """
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client is not configured")
        updates = expense.model_dump(exclude_unset=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields provided for update")

        response = (
            supabase.table("user_expenses")
            .update(updates)
            .eq("id", expense_id)
            .eq("user_key", user_id)
            .execute()
        )

        if response.data and len(response.data) > 0:
            return response.data[0]
        raise HTTPException(status_code=404, detail="Expense not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT, operation_id="delete_expense")
async def delete_expense(expense_id: str, user_id: str = Depends(get_current_user_id)):
    """
    Delete an expense for the current user.
    """
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client is not configured")
        existing = (
            supabase.table("user_expenses")
            .select("id")
            .eq("id", expense_id)
            .eq("user_key", user_id)
            .limit(1)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Expense not found")

        (
            supabase.table("user_expenses")
            .delete()
            .eq("id", expense_id)
            .eq("user_key", user_id)
            .execute()
        )
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
