---
title: Critical Signals
---


## Practising critical responses to disrupted futures.

---

Critical Signals invites you into a three-month public space for learning, imagining, and practising how sovereignty, resilience and collective care will shape our futures in times of rapid change.

---

Opening 18 July at 115 Taranaki Street, Critical Signals invites the public into a living research space for three months of workshops, installations, and conversations exploring the critical systems we rely on — from food to data, water to power — and how we build, own, and nurture them together.

Critical Signals explores practical and visionary responses to an era of collapses, with a focus on kai sovereignty, data sovereignty, collective resilience, and adaptation strategies under a rapidly changing climate. With community at the project center, it asks what changes could we make to our infrastructure, food and energy systems to ensure we not just survive, but thrive, in the years ahead.

Part artist lab, part civil defence rethink, part neighbourhood commons — Critical Signals offers a space to gather, experiment, and prepare. Open daily and free to all, it asks not just how we survive disruption, but how we create infrastructures for living — with care, agency, and creativity.



<script defer>
const NUMBER_IMAGES = 5

const options = [
  "HOW MANY DEVICES IS A LIFETIME",
  "DOES BAD WEATHER AFFECT CLOUD COMPUTING?",
  "HOW MANY DEVICES IS A LIFETIME?",
  "YOU JUST RECEIVED AND EMAIL.\nHOW?",
  "WHERE IS YOUR DATA?",
  "IS THERE MONEY WITHOUT THE INTERNET?",
  "WHAT IS THE CARBON FOOTPRINT OF A MEME?",
  "WHAT IF YOU COULD HOLD YOUR DATA?"
]


function setHeroText () {
  const text = options[random(options.length)]
  const heroTextEl = document.getElementById('target-question')
  heroTextEl.innerText = text
}
function setHeroImage () {
  const url = `/images/hero/${random(NUMBER_IMAGES) + 1}.webp`
  const heroImageEl = document.getElementById('target-hero')
  heroImageEl.setAttribute('src', url)
}

setHeroText()
setHeroImage()

setInterval(setHeroText, 5000)
setInterval(setHeroImage, 13000)

function random (n) {
  return Math.floor(Math.random() * n)
}
</script>


<style>
/* Over-ride defaults */
article {
}
.prose {
  max-width: 100%;
  margin-bottom: 3rem;
}

.homepage-hero {
  height: 100%;
  width: 100%;
  min-height: 30rem;

  display: grid;
  align-content: space-between;

  .question {
    justify-self: start;
    max-width: 40rem;

    font-family: bold_font;
    font-size: 4rem;
    line-height: 4.5rem;
    text-align: start;

    filter: drop-shadow(0 0 5px rgba(0,0,0, 0.2));
  }

  .logo {
     justify-self: end;
     max-width: 60%;
     max-height: 5rem;

     filter: drop-shadow(0 0 5px rgba(0,0,0, 0.6));
  }
}

@media (max-width: 768px) {
  article {
    margin-left: calc(var(--spacing) * -6);
    margin-right: calc(var(--spacing) * -6);
    max-width: calc(100% + calc(var(--spacing) * 12)) !important;
  }
</style>

