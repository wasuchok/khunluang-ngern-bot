import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get("/test", (c) => {
  return c.json({
    message : "wasuchoks"
  })
})

export default app
