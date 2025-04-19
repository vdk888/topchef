import psycopg2

conn = psycopg2.connect(
    "postgresql://neondb_owner:npg_lSxVsGncp85w@ep-green-glade-a5whn8ne.us-east-2.aws.neon.tech/neondb?sslmode=require"
)
cur = conn.cursor()
cur.execute("SELECT chef_name FROM candidates WHERE LOWER(chef_name) LIKE '%jorick%'")
results = cur.fetchall()
print("Results:", results)
cur.close()
conn.close()
