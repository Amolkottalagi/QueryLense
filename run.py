"""Start the app:  python run.py   (then open h)"""
import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=os.getenv("HOST", ""), port=int(os.getenv("PORT", "")),
                reload=os.getenv("RELOAD", "0") == "1")
