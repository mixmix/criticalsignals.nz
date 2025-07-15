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
    document.getElementById('listViewBtn').addEventListener('click', () => this.toggleListView());
    
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

  /** Toggle between calendar grid and list view */
  toggleListView() {
    console.log('Toggle List View clicked!');
    this.isListView = !this.isListView;
    console.log('isListView now:', this.isListView);
    
    const calendarContainer = document.querySelector('.border.border-neutral-200');
    const listView = document.getElementById('listView');
    const listViewBtn = document.getElementById('listViewBtn');
    const navigationCluster = document.querySelector('.flex.items-center.justify-center.space-x-4');
    
    console.log('Elements found:', { calendarContainer, listView, listViewBtn, navigationCluster });
    
    if (this.isListView) {
      console.log('Switching to list view...');
      calendarContainer.classList.add('hidden');
      listView.classList.remove('hidden');
      if (navigationCluster) navigationCluster.classList.add('hidden');
      listViewBtn.textContent = 'Calendar View';
      this.renderListView();
    } else {
      console.log('Switching to calendar view...');
      calendarContainer.classList.remove('hidden');
      listView.classList.add('hidden');
      if (navigationCluster) navigationCluster.classList.remove('hidden');
      listViewBtn.textContent = 'List View';
    }
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
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      const dayElement = this.createDayElement(date, month);
      grid.appendChild(dayElement);
    }
  }

  createDayElement(date, currentMonth) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    
    const isCurrentMonth = date.getMonth() === currentMonth;
    const isToday = this.isToday(date);
    
    if (!isCurrentMonth) {
      dayEl.classList.add('other-month');
    }
    
    if (isToday) {
      dayEl.classList.add('today');
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
    const titleLength = event.title.length;
    if (titleLength > 60) {
      eventEl.classList.add('event-item-tiny');
    } else if (titleLength > 40) {
      eventEl.classList.add('event-item-small');
    } else if (titleLength > 25) {
      eventEl.classList.add('event-item-medium');
    }
    
    eventEl.textContent = event.title;
    eventEl.addEventListener('click', () => this.showEventDetails(event));
    
    // Fine-tune font size after adding to DOM (for very long titles)
    setTimeout(() => this.adjustEventFontSize(eventEl), 0);
    
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
      if (currentFontSize > 8) { // Don't go below 8px
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

  renderListView() {
    console.log('=== RENDER LIST VIEW CALLED ===');
    const listEl = document.getElementById('eventList');
    console.log('eventList element found:', listEl);
    listEl.innerHTML = '';
    
    // Separate past and upcoming events
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    // Debug: Check if we have events data
    console.log('Events data for list view:', this.eventsData);
    console.log('Today is:', today);
    
    // Sort events by date (using NZST) - handle events without dates
    const sortedEvents = [...this.eventsData].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1; // Put events without dates at the end
      if (!b.date) return -1;
      if (a.dateTBC && !b.dateTBC) return 1; // Put TBC events at the end
      if (!a.dateTBC && b.dateTBC) return -1;
      if (a.dateTBC && b.dateTBC) return 0; // Keep TBC events in original order
      return parseEventDate(a.date) - parseEventDate(b.date);
    });
    
    console.log('Sorted events for list view:', sortedEvents.length, sortedEvents);
    
    if (sortedEvents.length === 0) {
      listEl.innerHTML = '<p class="no-events">No events found</p>';
      return;
    }
    
    const upcomingEvents = [];
    const pastEvents = [];
    
    sortedEvents.forEach(event => {
      if (event.dateTBC || !event.date) {
        upcomingEvents.push(event); // TBC and undated events go to upcoming
      } else {
        const eventDate = parseEventDate(event.date);
        console.log('Event:', event.title, 'Date:', event.date, 'Parsed Date:', eventDate, 'Today:', today, 'Is Future:', eventDate >= today);
        if (eventDate >= today) {
          upcomingEvents.push(event);
        } else {
          pastEvents.push(event);
        }
      }
    });
    
    console.log('Upcoming events:', upcomingEvents.length, upcomingEvents.map(e => e.title));
    console.log('Past events:', pastEvents.length, pastEvents.map(e => e.title));
    
    // Render past events in collapsible section at the top
    if (pastEvents.length > 0) {
      const pastSection = this.createPastEventsSection(pastEvents);
      listEl.appendChild(pastSection);
    }
    
    // Add section header for upcoming events if there are past events
    if (pastEvents.length > 0 && upcomingEvents.length > 0) {
      const upcomingHeader = document.createElement('h3');
      upcomingHeader.className = 'upcoming-events-title';
      upcomingHeader.textContent = 'Upcoming Events';
      listEl.appendChild(upcomingHeader);
    }
    
    // Render upcoming events
    if (upcomingEvents.length > 0) {
      upcomingEvents.forEach(event => {
        listEl.appendChild(this.createEventListItem(event));
      });
    }
    
    // Show message if no upcoming events
    if (upcomingEvents.length === 0) {
      const noEventsMsg = document.createElement('p');
      noEventsMsg.className = 'no-upcoming-events';
      noEventsMsg.textContent = 'No upcoming events';
      listEl.appendChild(noEventsMsg);
    }
  }

  createPastEventsSection(pastEvents) {
    const pastSection = document.createElement('div');
    pastSection.className = 'past-events-section';
    
    const pastHeader = document.createElement('button');
    pastHeader.className = 'past-events-toggle';
    
    const chevron = document.createElement('span');
    chevron.className = 'past-events-chevron';
    chevron.textContent = '▶';
    pastHeader.appendChild(chevron);
    
    const headerText = document.createElement('span');
    headerText.textContent = `Past Events (${pastEvents.length})`;
    pastHeader.appendChild(headerText);
    
    const pastContainer = document.createElement('div');
    pastContainer.className = 'past-events-container';
    pastContainer.style.display = 'none';
    
    pastEvents.forEach(event => {
      pastContainer.appendChild(this.createEventListItem(event));
    });
    
    pastHeader.addEventListener('click', () => {
      const isHidden = pastContainer.style.display === 'none';
      pastContainer.style.display = isHidden ? 'block' : 'none';
      chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
    });
    
    pastSection.appendChild(pastHeader);
    pastSection.appendChild(pastContainer);
    return pastSection;
  }
  
  createEventListItem(event) {
    const eventEl = document.createElement('div');
    eventEl.className = 'event-list-item';
    
    let eventHTML = `
      <div class="event-list-content">
        <div class="event-list-main">
          <h4 class="event-list-title">${event.title}</h4>
    `;
    
    if (event.dateTBC) {
      eventHTML += '<p class="event-list-date-tbc"><em>Date to be confirmed</em></p>';
    } else {
      const eventDate = parseEventDate(event.date);
      eventHTML += `<p class="event-list-date">
        ${eventDate.toLocaleDateString('en-NZ', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          timeZone: 'Pacific/Auckland'
        })}
      </p>`;
    }
    
    if (event.startTime) {
      eventHTML += `<p class="event-list-time">
        ${event.startTime}${event.endTime ? ' - ' + event.endTime : ''}
      </p>`;
    }
    
    if (event.hosts && event.hosts.length > 0) {
      const hostLabel = event.hosts.length === 1 ? 'Host:' : 'Hosts:';
      eventHTML += `<p class="event-list-hosts">
        <span class="hosts-label">${hostLabel}</span> ${event.hosts.join(', ')}
      </p>`;
    }
    
    eventHTML += `
        </div>
        <div class="event-list-actions">
          <a href="${event.url}" class="btn-list-details" onclick="event.stopPropagation()">
            Details
          </a>
          ${event.signUpLink ? `<a href="${event.signUpLink}" target="_blank" class="btn-list-register" onclick="event.stopPropagation()">Register</a>` : ''}
        </div>
      </div>
    `;
    
    eventEl.innerHTML = eventHTML;
    eventEl.addEventListener('click', () => this.showEventDetails(event));
    return eventEl;
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