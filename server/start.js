import app from './index.js'

const PORT = Number(process.env.PORT || 8787)

app.listen(PORT, () => {
    console.log(`TMDB proxy running on http://localhost:${PORT}`)
})
