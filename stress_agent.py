import asyncio
import time
import psutil

class StressAgent:
    def __init__(self, target, max_workers=50):
        self.target = target
        self.max_workers = max_workers
        self.results = []

    async def worker(self, session, i):
        start = time.time()
        try:
            async with session.get(self.target) as r:
                await r.text()
                latency = time.time() - start
                self.results.append((latency, r.status))
        except Exception as e:
            self.results.append((None, str(e)))

    async def run(self):
        import aiohttp
        async with aiohttp.ClientSession() as session:
            tasks = [self.worker(session, i) for i in range(self.max_workers)]
            await asyncio.gather(*tasks)

    def analyze(self):
        latencies = [r[0] for r in self.results if r[0] is not None]
        errors = [r for r in self.results if r[0] is None]

        return {
            "requests": len(self.results),
            "avg_latency": sum(latencies)/len(latencies) if latencies else 0,
            "max_latency": max(latencies) if latencies else 0,
            "errors": len(errors),
            "cpu": psutil.cpu_percent(),
            "memory": psutil.virtual_memory().percent
        }

if __name__ == "__main__":
    agent = StressAgent("http://localhost:8000", max_workers=100)
    asyncio.run(agent.run())
    print(agent.analyze())
