# Sample photos

Test ke liye ghar/building ki asli photos yahan rakho — `samples/house1.jpg`,
`samples/house2.jpg` waghera.

GitHub par seedha upload karne ka tareeqa: repo ke **Add file → Upload files**
par jao, photo drag karo, aur naam ke aage folder likh do (`samples/house1.jpg`),
phir **Commit changes**.

Phir poori pipeline ek command mein chal jaati hai:

```bash
cd frontend
npm install
npm run dev            # ek terminal mein
npm run test:sample -- ../samples/house1.jpg   # doosre mein
```

`sample-out/` mein ye milega:

| file | kya hai |
|---|---|
| `00-zones.jpg` | kya detect hua — laal = deewar, neela = trim, peela = gate, jamni = sky |
| `01-sky-tidied.jpg` | sky saaf hone ke baad ki base image |
| `02-…` se aage | har colour scheme ka board |

Detection kahin ghalti kare to `00-zones.jpg` sab se zyada kaam ki file hai —
usi se pata chalta hai ke kaunsi cheez ghalat role mein gayi.
