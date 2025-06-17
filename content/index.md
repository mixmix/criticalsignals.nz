---
title: Critical Signals
---

<img class='logo' src="/symbol.svg" />

<div class='info'>
  <div class='description'>
    Critical Signals invites you into a three-month public space for learning,
    imagining, and practising how sovereignty, resilience and collective care
    will shape our future.
  </div>

  <div class='divider' ></div>

  <div class='space-time'>
    <div>Opening Friday 18th July</div>
    <div>115 Taranaki Street</div>
    <div>Te Whanganui-a-Tara / Wellington</div>
  </div>
</div>

<style>
/* Temp - disable menu + h1*/
.main-menu, h1 { display: none; }

.prose {
  max-width: 100%;
}

/* section { */
/*   width: 100%; */
/* } */

.logo {
  max-width: 1000px;
  margin: 0 auto 6rem auto;
}

.info {
  display: grid;
  grid-template-columns: auto 2px auto;
  grid-gap: 2rem;

  align-items: center;

  font-family: serif;

  .description {
    font-size: .9rem;
    text-align: justify;
    line-height: 1.3rem;
    max-width: 420px;
  }

  .divider {
    height: 60%;
    background-color: rgb(var(--color-neutral));
    border-radius: 5px;
  }

  .space-time {
    display: grid;
    justify-items: start;
  }
}

@media (max-width: 768px) {
.info {
  display: grid;
  grid-template-columns: auto;
  grid-template-rows: auto 2px auto;
  grid-gap: 2rem;

  justify-items: center;

  .description {
  }
  .divider {
    width: 20%;
    border-radius: 5px;
  }
  .space-time {
  }
}
</style>
