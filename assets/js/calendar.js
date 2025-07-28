/**
 * Interactive Calendar for Critical Signals Events
 * Auto-generates from Hugo programme content
 * All dates and times are displayed in NZST (Pacific/Auckland timezone)
 */

console.log('Calendar script loading...');

// Helper function to parse dates consistently in NZST
function parseEventDate(dateStr) {
  // Handle both "2025-06-10" and "2025-06-10T00:00:00Z" formats
  const dateOnly = dateStr.split('T')[0];
  const parts = dateOnly.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

class Calendar {
  constructor(eventsData, collaboratorsData) {
    this.eventsData = eventsData;
    this.collaboratorsData = collaboratorsData;
    this.currentDate = new Date();
    this.selectedDate = null;
    this.isListView = false;
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
    // start date we rendering:
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const lastDay = new Date(year, month + 1, 0);
    const endDate = new Date(lastDay)
    endDate.setDate(lastDay.getDate() + 7 - lastDay.getDay())

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      if (date >= endDate) continue

      const dayElement = this.createDayElement(date, month);
      grid.appendChild(dayElement);
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

    // Day number
    const dayNumber = document.createElement('div');
    dayNumber.className = 'calendar-day-number';
    
    if (isToday) {
      dayNumber.classList.add('today-number');
    }
    
    dayNumber.textContent = date.getDate();
    dayEl.appendChild(dayNumber);

    // Events container
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'calendar-events-container';
    
    // Events for this day
    const dayEvents = this.getEventsForDate(date);
    dayEvents.forEach(event => {
      const eventEl = this.createEventElement(event);
      eventsContainer.appendChild(eventEl);
    });
    
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

  /** Get all events for a specific date */
  getEventsForDate(date) {
    const dateStr = date.toISOString().split('T')[0];
    return this.eventsData.filter(event => {
      if (event.dateTBC) return false;
      const eventDate = parseEventDate(event.date);
      return eventDate.toISOString().split('T')[0] === dateStr;
    });
  }

  isToday(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  isPast(date) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    return toYearMonthDay(date) < toYearMonthDay(yesterday)
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
    
    const buttonsHTML = `
      <div class="event-actions">
        <a href="${event.url}" class="btn-details">
          View Full Details
        </a>
        ${event.signUpLink ? `<a href="${event.signUpLink}" target="_blank" class="btn-register">Register</a>` : '<span class="registration-note">Registration coming soon</span>'}
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

function toYearMonthDay (date) {
  return date.toISOString().split('T')[0]
}
