---
title: "Project Launch Party"
hosts:
  - "Jessica Hutchinson"
  - "Sophie Jerram"
  - "Julian Oliver"
  - "Ira Bailey"
  - "Ollie Hutton"
  - "Jack Gittings"
  - "Ash Holwell"
date: 2025-07-18
start_time: 17:30
end_time: 19:30
categories:
  - Event
no_link:
  - "off"
---

You are invited to join us for the launch of Critical Signals, a three-month public space for learning, imagining, and practising how sovereignty, resilience and collective care will shape our futures in times of rapid change.

Please join us for karakia, talks, kai, wai and connection as we celebrate the launch of the project.


  <div class="newsletter-form-container">
    <form class="newsletter-form" action="https://app.loops.so/api/newsletter-form/cmci5j23a3ywvul0juqembgag" method="POST" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
      <input class="newsletter-form-input" name="newsletter-form-input" type="email" placeholder="your.email@example.com" required="" style="font-family: regular_font, Helvetica, sans-serif; color: rgb(25, 64, 33); font-size: 16px; margin: 0px 0px 10px; width: 100%; max-width: 400px; min-width: 100px; background: rgb(248, 244, 206); border: 2px solid rgb(25, 64, 33); box-sizing: border-box; border-radius: 8px; padding: 10px 14px; transition: all 0.2s ease;">
      <button type="submit" class="newsletter-form-button" style="background: rgb(25, 64, 33); font-size: 16px; color: rgb(248, 244, 206); font-family: bold_font, Helvetica-Bold, sans-serif; display: flex; width: 100%; max-width: 400px; white-space: normal; height: 42px; align-items: center; justify-content: center; flex-direction: row; padding: 10px 20px; border-radius: 8px; text-align: center; font-style: normal; font-weight: bold; line-height: 20px; border: 3px solid rgb(248, 244, 206); cursor: pointer; transition: all 0.2s ease; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);">
Interested?  Join the list!
      </button>
      <button type="button" class="newsletter-loading-button" style="background: rgb(25, 64, 33); font-size: 16px; color: rgb(248, 244, 206); font-family: bold_font, Helvetica-Bold, sans-serif; display: none; width: 100%; max-width: 400px; white-space: normal; height: 42px; align-items: center; justify-content: center; flex-direction: row; padding: 10px 20px; border-radius: 8px; text-align: center; font-style: normal; font-weight: bold; line-height: 20px; border: 3px solid rgb(248, 244, 206); cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);">
        Please wait...
      </button>
    </form>
    <div class="newsletter-success" style="display: none; align-items: center; justify-content: center; width: 100%;">
      <p class="newsletter-success-message" style="font-family: regular_font, Helvetica, sans-serif; color: rgb(248, 244, 206); font-size: 16px; text-align: center; margin: 10px 0;">
        Thanks! We'll keep you updated on our progress.
      </p>
    </div>
    <div class="newsletter-error" style="display: none; align-items: center; justify-content: center; width: 100%;">
      <p class="newsletter-error-message" style="font-family: regular_font, Helvetica, sans-serif; color: rgb(248, 244, 206); font-size: 16px; text-align: center; margin: 10px 0;">
        Oops! Something went wrong, please try again
      </p>
    </div>
    <button class='newsletter-back-button' type='button' 
      style='color: rgb(248, 244, 206); font-family: regular_font, Helvetica, sans-serif; font-size: 14px; margin: 8px auto; text-align: center; display: none; background: transparent; border: none; cursor: pointer; text-decoration: underline;'
      onmouseout='this.style.opacity="0.8"' 
      onmouseover='this.style.opacity="1"'>
      ← Back
    </button>
  </div>
  
  <p style="margin-top: 2rem; margin-bottom: 0; font-size: 12px; opacity: 0.7; line-height: 1.4;">
    We use
    <a href="https://loops.so/privacy" target="_blank" rel="noopener noreferrer">Loops.so</a>
    for our newsletter. View their privacy policy for details on how your email
    and associated data is handled.
  </p>
  
  <p style="margin-top: 4px; font-size: 14px; opacity: 0.8;">
    Or contact us directly: 
    <a href='mailto:contact@criticalsignals.nz' class="contact-link" style="">
    contact@criticalsignals.nz
    </a>
  </p>
</div>

<script>
function submitHandler(event) {
  event.preventDefault();
  var container = event.target.parentNode;
  var form = container.querySelector(".newsletter-form");
  var formInput = container.querySelector(".newsletter-form-input");
  var success = container.querySelector(".newsletter-success");
  var errorContainer = container.querySelector(".newsletter-error");
  var errorMessage = container.querySelector(".newsletter-error-message");
  var backButton = container.querySelector(".newsletter-back-button");
  var submitButton = container.querySelector(".newsletter-form-button");
  var loadingButton = container.querySelector(".newsletter-loading-button");
  
  const rateLimit = () => {
    errorContainer.style.display = "flex";
    errorMessage.innerText = "Too many signups, please try again in a little while";
    submitButton.style.display = "none";
    formInput.style.display = "none";
    backButton.style.display = "block";
  }

  var time = new Date();
  var timestamp = time.valueOf();
  var previousTimestamp = localStorage.getItem("loops-form-timestamp");

  if (previousTimestamp && Number(previousTimestamp) + 60000 > timestamp) {
    rateLimit();
    return;
  }
  localStorage.setItem("loops-form-timestamp", timestamp);

  submitButton.style.display = "none";
  loadingButton.style.display = "flex";

  var formBody = "userGroup=&mailingLists=&email=" 
    + encodeURIComponent(formInput.value);

  fetch(event.target.action, {
    method: "POST",
    body: formBody,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  })
    .then((res) => [res.ok, res.json(), res])
    .then(([ok, dataPromise, res]) => {
      if (ok) {
        success.style.display = "flex";
        form.reset();
      } else {
        dataPromise.then(data => {
          errorContainer.style.display = "flex";
          errorMessage.innerText = data.message
            ? data.message
            : res.statusText;
        });
      }
    })
    .catch(error => {
      if (error.message === "Failed to fetch") {
        rateLimit();
        return;
      }
      errorContainer.style.display = "flex";
      if (error.message) errorMessage.innerText = error.message;
      localStorage.setItem("loops-form-timestamp", '');
    })
    .finally(() => {
      formInput.style.display = "none";
      loadingButton.style.display = "none";
      backButton.style.display = "block";
    });
}

function resetFormHandler(event) {
  var container = event.target.parentNode;
  var formInput = container.querySelector(".newsletter-form-input");
  var success = container.querySelector(".newsletter-success");
  var errorContainer = container.querySelector(".newsletter-error");
  var errorMessage = container.querySelector(".newsletter-error-message");
  var backButton = container.querySelector(".newsletter-back-button");
  var submitButton = container.querySelector(".newsletter-form-button");

  success.style.display = "none";
  errorContainer.style.display = "none";
  errorMessage.innerText = "Oops! Something went wrong, please try again";
  backButton.style.display = "none";
  formInput.style.display = "flex";
  submitButton.style.display = "flex";
}

var formContainers = document.getElementsByClassName("newsletter-form-container");
for (var i = 0; i < formContainers.length; i++) {
  var formContainer = formContainers[i]
  var handlersAdded = formContainer.classList.contains('newsletter-handlers-added')
  if (handlersAdded) continue;
  formContainer
    .querySelector(".newsletter-form")
    .addEventListener("submit", submitHandler);
  formContainer
    .querySelector(".newsletter-back-button")
    .addEventListener("click", resetFormHandler);
  formContainer.classList.add("newsletter-handlers-added");
}
</script>




