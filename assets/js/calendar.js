/**
 * Interactive Calendar for Critical Signals Events
 * Auto-generates from Hugo programme content
 * All dates and times are displayed in NZST (Pacific/Auckland timezone).
 * "Today" is also *measured* in Pacific/Auckland (see nzTodayString()) even
 * though this runs in the visitor's own browser — every event happens in
 * Wellington, so that's the calendar a visitor elsewhere needs "today",
 * "past" and "has this event passed" judged against, not their own.
 */

// Helper function to parse dates consistently in NZST
function parseEventDate(dateStr) {
  // Handle both "2025-06-10" and "2025-06-10T00:00:00Z" formats
  const dateOnly = dateStr.split('T')[0];
  const parts = dateOnly.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

// "Today", in Wellington — not the visitor's own device clock/timezone. A
// visitor browsing from anywhere east of NZ (most of the Pacific, the
// Americas) can be a calendar day behind NZT at the same real instant;
// reading `new Date()` directly would show the wrong day as "today" and
// misjudge which events have passed. Returns "YYYY-MM-DD" so it composes
// with parseEventDate() and toYearMonthDay() below.
function nzTodayString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

class Calendar {
  constructor(eventsData, collaboratorsData) {
    this.eventsData = eventsData;
    this.collaboratorsData = collaboratorsData;
    // Open on the month of the earliest upcoming event, so visitors land on
    // events rather than an empty current month (the season runs Aug–Oct).
    this.currentDate = this.initialMonth();
    this.selectedDate = null;
    this.isListView = false;
    this.isFirstRender = true;
    this.monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    this.init();
  }

  init() {
    this.bindEvents();
    this.render();
  }

  /** Month to open on: the earliest upcoming event's month, else the current month. */
  initialMonth() {
    const today = parseEventDate(nzTodayString());
    const upcoming = this.eventsData
      .filter(e => !e.dateTBC && e.date)
      .map(e => parseEventDate(e.date))
      .filter(d => d >= today)
      .sort((a, b) => a - b);
    if (upcoming.length) {
      return new Date(upcoming[0].getFullYear(), upcoming[0].getMonth(), 1);
    }
    return today;
  }

  bindEvents() {
    // Navigation controls
    document.getElementById('prevMonth').addEventListener('click', () => this.previousMonth());
    document.getElementById('nextMonth').addEventListener('click', () => this.nextMonth());

    // Modal controls
    document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
    document.getElementById('eventModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });
  }

  /** Navigate to previous month */
  previousMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.render();
  }

  /** Navigate to next month */
  nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.render();
  }

  render() {
    this.renderHeader();
    this.renderCalendarGrid();
  }

  renderHeader() {
    const currentMonthEl = document.getElementById('currentMonth');
    currentMonthEl.textContent = `${this.monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
  }

  renderCalendarGrid() {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    // Grid is Monday-first: shift the JS week (0=Sun) so Monday is column 0.
    const startDate = new Date(firstDay);
    const startOffset = (firstDay.getDay() + 6) % 7;
    startDate.setDate(startDate.getDate() - startOffset);

    const lastDay = new Date(year, month + 1, 0);
    const endDate = new Date(lastDay)
    let endOffset = (8 - lastDay.getDay()) % 7;
    if (endOffset === 0) endOffset = 7; // full trailing week when the month ends on a Monday
    endDate.setDate(lastDay.getDate() + endOffset)

    let visibleIndex = 0;
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      if (date >= endDate) continue

      // Row-major grid order is already top-left -> bottom-right, so a
      // simple incrementing delay staggers the arrival animation that way.
      const dayElement = this.createDayElement(date, month);
      dayElement.classList.add('cal-day-anim');
      dayElement.style.animationDelay = `${visibleIndex * 12}ms`;
      // Drop the animation once it finishes so it doesn't keep overriding
      // normal styles like :hover indefinitely.
      dayElement.addEventListener('animationend', () => {
        dayElement.classList.remove('cal-day-anim');
        dayElement.style.animationDelay = '';
      }, { once: true });
      grid.appendChild(dayElement);
      visibleIndex++;
    }

    if (this.isFirstRender) {
      document.querySelector('.calendar-container').classList.remove('is-loading');
      this.isFirstRender = false;
    }
  }

  createDayElement(date, currentMonth) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    
    const isCurrentMonth = date.getMonth() === currentMonth;
    const isToday = this.isToday(date);
    const isPast = this.isPast(date);
    
    if (!isCurrentMonth) {
      dayEl.classList.add('other-month');
    }
    
    if (isToday) {
      dayEl.classList.add('today');
    }

    if (isPast) {
      dayEl.classList.add('past');
    }

    // Monday-first grid, so Sat/Sun are the last two columns.
    if (date.getDay() === 0 || date.getDay() === 6) {
      dayEl.classList.add('weekend');
    }

    const dayEvents = this.getEventsForDate(date);

    // Top row: any `calendar_symbol` events sit here, on the same line as the
    // date, so a recurring event marks its days without taking a list slot.
    const head = document.createElement('div');
    head.className = 'calendar-day-head';

    const symbols = document.createElement('div');
    symbols.className = 'calendar-day-symbols';
    dayEvents
      .filter(event => event.calendarSymbol)
      .forEach(event => symbols.appendChild(this.createEventElement(event)));
    head.appendChild(symbols);

    // Day number
    const dayNumber = document.createElement('div');
    dayNumber.className = 'calendar-day-number';

    if (isToday) {
      dayNumber.classList.add('today-number');
    }

    dayNumber.textContent = date.getDate();
    head.appendChild(dayNumber);
    dayEl.appendChild(head);

    // Events container — everything that shows as a title
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'calendar-events-container';

    dayEvents
      .filter(event => !event.calendarSymbol)
      .forEach(event => eventsContainer.appendChild(this.createEventElement(event)));

    dayEl.appendChild(eventsContainer);

    return dayEl;
  }

  /** Create an event element for calendar display */
  createEventElement(event) {
    const eventEl = document.createElement('div');
    eventEl.className = 'event-item';
    
    // Apply color coding based on event category
    const category = event.categories && event.categories.length > 0 
      ? event.categories[0].toLowerCase() 
      : 'default';
    eventEl.classList.add(`event-${category}`);

    // `sign_up_link: false` means drop in, no ticket needed — those get a white
    // border rather than their category's.
    if (event.signUpLink === false) {
      eventEl.classList.add('event-item--no-signup');
    }

    // A recurring event can set `calendar_symbol: "☕"` in front matter to show
    // as a single glyph on the day's top row rather than repeating its title on
    // every day it runs. createDayElement puts these in .calendar-day-symbols.
    if (event.calendarSymbol) {
      eventEl.classList.add('event-item--symbol');
      eventEl.textContent = event.calendarSymbol;
      eventEl.title = event.title;
      eventEl.addEventListener('click', () => this.showEventDetails(event));
      return eventEl;
    }

    // Add responsive font sizing based on title length
    // const titleLength = event.title.length;
    // if (titleLength > 60) {
    //   eventEl.classList.add('event-item-tiny');
    // } else if (titleLength > 40) {
    //   eventEl.classList.add('event-item-small');
    // } else if (titleLength > 25) {
    //   eventEl.classList.add('event-item-medium');
    // }
    
    const doSqueeze = window.innerWidth < 640 

    const trimLength = doSqueeze ? 22 : 50
    let title = []
    let lengthSoFar = 0
    const words = event.title.split(' ')
    while (lengthSoFar < trimLength && words.length) {
      const word = words.shift()
      title.push(word)
      lengthSoFar += word.length
    }
    if (lengthSoFar + title.length - 1 != event.title.length) title.push('...')
    
    eventEl.textContent = title.join(' ');
    eventEl.addEventListener('click', () => this.showEventDetails(event));
    
    // Fine-tune font size after adding to DOM (for very long titles)
    if (doSqueeze) {
      setTimeout(() => this.adjustEventFontSize(eventEl), 0);
    }
    
    return eventEl;
  }

  /** Dynamically adjust font size if text overflows container */
  adjustEventFontSize(eventEl) {
    if (!eventEl.parentNode) return;
    
    const containerHeight = eventEl.parentNode.clientHeight - 30; // Reserve space for day number
    const availableHeight = Math.max(containerHeight, 60); // Minimum height
    
    // If the content height exceeds available space, reduce font size
    if (eventEl.scrollHeight > availableHeight) {
      const currentFontSize = parseInt(window.getComputedStyle(eventEl).fontSize);
      const minSize = 11 // Don't go below this size
      if (currentFontSize > minSize) { 
        eventEl.style.fontSize = (currentFontSize - 1) + 'px';
        eventEl.style.lineHeight = '1.0';
        // Recursively adjust if still overflowing
        setTimeout(() => this.adjustEventFontSize(eventEl), 0);
      }
    }
  }

  /** Get all events for a specific date, in the order they start */
  getEventsForDate(date) {
    const dateStr = toYearMonthDay(date);
    return this.eventsData.filter(event => {
      if (event.dateTBC || !event.date) return false;
      const eventDate = parseEventDate(event.date);
      return toYearMonthDay(eventDate) === dateStr;
    }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }

  isToday(date) {
    return toYearMonthDay(date) === nzTodayString();
  }

  // Grid-cell "past" styling: any day strictly before today (in NZT), full
  // stop. Not the same rule as eventHasPassed below, which gives ticket
  // sales a 2-day grace period — that's about when to stop selling, this is
  // about which calendar days already happened, so today's -1 must count.
  isPast(date) {
    return toYearMonthDay(date) < nzTodayString();
  }

  showEventDetails(event) {
    const modal = document.getElementById('eventModal');
    const title = document.getElementById('modalTitle');
    const content = document.getElementById('modalContent');
    
    title.textContent = event.title;
    
    let contentHTML = '';
    
    if (event.dateTBC) {
      contentHTML += '<p class="event-date-tbc"><em>Date to be confirmed</em></p>';
    } else {
      const eventDate = parseEventDate(event.date);
      contentHTML += `<p class="event-date">
        <strong>Date:</strong> ${eventDate.toLocaleDateString('en-NZ', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          timeZone: 'Pacific/Auckland'
        })}
      </p>`;
      if (event.dateCount > 1) {
        contentHTML += `<p class="event-recurring">One of ${event.dateCount} dates &mdash; see the event page for all of them.</p>`;
      }
    }
    
    if (event.startTime) {
      contentHTML += `<p class="event-time">
        <strong>Time:</strong> ${event.startTime}${event.endTime ? ' - ' + event.endTime : ''}
      </p>`;
    }
    
    if (event.content) {
      let cleanContent = event.content.trim();
      
      // Special handling for Project Launch Party - trim at specific point
      if (event.title === "Project Launch Party") {
        const cutoffPoint = cleanContent.indexOf('Please join us for karakia, talks, kai, wai and connection as we celebrate the launch of the project.');
        if (cutoffPoint !== -1) {
          // Find the end of that sentence
          const endOfSentence = cutoffPoint + 'Please join us for karakia, talks, kai, wai and connection as we celebrate the launch of the project.'.length;
          cleanContent = cleanContent.substring(0, endOfSentence);
        }
      }
      
      if (cleanContent) {
        contentHTML += `<div class="event-content">
          <div class="event-description">${cleanContent}</div>
        </div>`;
      }
    }
    
    // Add hosts section if hosts exist
    if (event.hosts && event.hosts.length > 0) {
      const hostLabel = event.hosts.length === 1 ? 'Host' : 'Hosts';
      contentHTML += `<div class="event-hosts">
        <h4 class="hosts-title">${hostLabel}</h4>
        <div class="hosts-list">`;
      
      event.hosts.forEach(host => {
        // Check if this host has a collaborator profile with image
        const collaborator = this.collaboratorsData[host];
        let hostImageHTML = '';
        
        if (collaborator && collaborator.image) {
          // Use real photo
          hostImageHTML = `<img src="${collaborator.image}" alt="${host}" class="host-image">`;
        } else {
          // Fall back to initials
          hostImageHTML = `<div class="host-initials">
            ${host.charAt(0).toUpperCase()}
          </div>`;
        }
        
        contentHTML += `
          <div class="host-item">
            ${hostImageHTML}
            <div class="host-name">
              ${collaborator ? `<a href="${collaborator.url}" class="host-link">${host}</a>` : host}
            </div>
          </div>`;
      });
      
      contentHTML += `    </div>
      </div>`;
    }
    
    // Check if event has passed (more than 2 days ago, in NZT)
    let eventHasPassed = false;
    if (!event.dateTBC && event.date) {
      const eventDate = parseEventDate(event.date);
      const today = parseEventDate(nzTodayString());
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(today.getDate() - 2);
      eventHasPassed = eventDate < twoDaysAgo;
    }

    // Generate registration button based on event status
    let registerButton = '';
    if (event.signUpLink === false) {
      // sign_up_link: false means the event needs no sign-up at all
      registerButton = eventHasPassed
        ? '<span class="event-passed-text">this event has passed</span>'
        : '<span class="registration-note">No Tickets Required</span>';
    } else if (event.signUpLink) {
      if (eventHasPassed) {
        registerButton = `
          <a class="btn-register event-passed" style="cursor: not-allowed; opacity: 0.5;">Tickets</a>
          <span class="event-passed-text">this event has passed</span>`;
      } else {
        registerButton = `<a href="${event.signUpLink}" target="_blank" class="btn-register">Tickets</a>`;
      }
    } else {
      if (eventHasPassed) {
        registerButton = '<span class="event-passed-text">this event has passed</span>';
      } else {
        registerButton = '<span class="registration-note">Registration coming soon</span>';
      }
    }

    const buttonsHTML = `
      <div class="event-actions">
        <a href="${event.url}" class="btn-details">
          View Full Details
        </a>
        ${registerButton}
      </div>
    `;
    
    content.innerHTML = contentHTML + buttonsHTML;
    modal.style.display = 'block';
  }

  closeModal() {
    document.getElementById('eventModal').style.display = 'none';
  }
}

// Initialize calendar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM ready, initializing calendar...');
  try {
    // Get data from script tags
    const eventsData = JSON.parse(document.getElementById('events-data').textContent);
    const collaboratorsData = JSON.parse(document.getElementById('collaborators-data').textContent);
    
    console.log('Events and collaborators data loaded:', eventsData.length, 'events');
    
    new Calendar(eventsData, collaboratorsData);
    console.log('Calendar initialized successfully');
  } catch (error) {
    console.error('Error initializing calendar:', error);
  }
}); 

// Reads the Date object's own local fields — not .toISOString(), which
// reports in UTC and would shift the date for any local-midnight Date whose
// timezone offset isn't 00:00 (which every Date in this file is: they're all
// built by parseEventDate()/nzTodayString() as browser-local midnight).
function toYearMonthDay (date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
