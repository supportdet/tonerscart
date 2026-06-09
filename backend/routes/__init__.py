"""Route modules split out of server.py. Each defines its own APIRouter and is
registered in server.py. They import the shared kernel (clients, models,
dependencies, helpers) from `server`."""
