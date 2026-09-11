from fastapi import APIRouter
router=APIRouter(prefix="/video",tags=["Video"])
@router.get("/health")
def health(): return {"status":"Backend Working"}
