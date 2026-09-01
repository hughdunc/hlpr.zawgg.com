document.getElementById('date').textContent = new Date().toLocaleDateString();
const ICS_URL = "./calendar.ics";
let current_day = "No School"
let dayType

// Keep track of the non-countdown title so we can restore it when there's no active period
const BASE_TITLE = document.title || "Hlpr";

function unfoldICS(raw) {
	raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	return raw.replace(/\n[ \t]/g, '');
}
function parseICSTime(value, params) {
	if (!value) return null;
	if ((params && /VALUE=DATE/i.test(params)) || /^\d{8}$/.test(value)) {
		const y = value.slice(0,4), m = value.slice(4,6), d = value.slice(6,8);
		return new Date(`${y}-${m}-${d}T00:00:00`);
	}
	if (value.endsWith('Z')) {
		const y = value.slice(0,4), mo = value.slice(4,6), da = value.slice(6,8);
		const hh = value.slice(9,11), mm = value.slice(11,13), ss = value.slice(13,15) || '00';
		return new Date(`${y}-${mo}-${da}T${hh}:${mm}:${ss}Z`);
	}
	if (/^\d{8}T\d{4,6}$/.test(value)) {
		const y = value.slice(0,4), mo = value.slice(4,6), da = value.slice(6,8);
		const hh = value.slice(9,11), mm = value.slice(11,13), ss = value.slice(13,15) || '00';
		return new Date(`${y}-${mo}-${da}T${hh}:${mm}:${ss}`);
	}
	const tryIso = value.replace(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/, (m,y,mo,da,hh,mm,ss)=>{
		hh = hh||'00'; mm=mm||'00'; ss=ss||'00';
		return `${y}-${mo}-${da}T${hh}:${mm}:${ss}`;
	});
	const dt = new Date(tryIso);
	return isNaN(dt) ? null : dt;
}
function parseICS(raw) {
	const unfolded = unfoldICS(raw);
	const lines = unfolded.split(/\n/);
	const events = [];
	let inEvent = false;
	let current = null;
	for (const line of lines) {
		if (!line) continue;
		if (line === 'BEGIN:VEVENT') { inEvent=true; current={props:{}}; continue; }
		if (line === 'END:VEVENT') {
			if(current){
				const dtstartRaw = current.props['DTSTART']?.value || current.props['DTSTART;VALUE=DATE']?.value;
				const dtstartParams = current.props['DTSTART']?.params || current.props['DTSTART;VALUE=DATE']?.params;
				const dtendRaw = current.props['DTEND']?.value;
				const dtendParams = current.props['DTEND']?.params;
				const startDate = parseICSTime(dtstartRaw, dtstartParams);
				const endDate = parseICSTime(dtendRaw, dtendParams);
				events.push({
					summary: current.props['SUMMARY']?.value || '(no title)',
					description: current.props['DESCRIPTION']?.value || '',
					location: current.props['LOCATION']?.value || '',
					uid: current.props['UID']?.value || '',
					startDate,
					endDate
				});
			}
			inEvent=false;
			current=null;
			continue;
		}
		if(inEvent && current){
			const m = line.match(/^([^:]+):([\s\S]*)$/);
			if(!m) continue;
			const left = m[1];
			const value = m[2];
			const [propName,...paramParts] = left.split(';');
			const propKey = propName.toUpperCase();
			const params = paramParts.join(';');
			current.props[left.toUpperCase()] = { value, params };
			if(!current.props[propKey]) current.props[propKey] = { value, params };
			else current.props[propKey].value = value;
		}
	}
	return events;
}
function renderEvents(events){
	const container = document.getElementById('events');
	if (!container) return;
	container.innerHTML = '';
	if(!events.length){
		container.innerHTML = '<div class="error">No events parsed.</div>';
		const sd = document.getElementById("schoolday")
		if (sd) sd.innerText = current_day
		return;
	}
	events.sort((a,b)=>{
		if(!a.startDate && !b.startDate) return 0;
		if(!a.startDate) return 1;
		if(!b.startDate) return -1;
		return a.startDate-b.startDate;
	});
	for(const e of events){
		if (/\bA Day\b/i.test(e.summary) || /\bB Day\b/i.test(e.summary)) {
			current_day = e.summary;
			continue
		}
		const div = document.createElement('div');
		div.className='event';
		const summary = document.createElement('span');
		summary.className='summary';
		summary.textContent=e.summary;
		div.appendChild(summary);
		if(e.startDate) {
			const time = document.createElement("span");
			time.className = "time";
			const val = e.startDate.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'});
			time.textContent = val
			summary.appendChild(time);
		}
		const info = document.createElement("div");
		info.className="info";
		if(e.location) {
			const location = document.createElement('p');
			location.className="location";
			location.textContent = e.location
			info.appendChild(location)
		}
		if(e.description){
			const desc = document.createElement('div');
			desc.className="description";
			desc.innerHTML = e.description.replace(/\\n/g,'');
			info.appendChild(desc);
		}
		div.appendChild(info);
		container.appendChild(div);
	}
	const sd = document.getElementById("schoolday")
	if (sd) sd.innerText = current_day
}
async function loadEvents(){
	const res = await fetch(ICS_URL);
	if(!res.ok) throw new Error('Network response not ok: '+res.status);
	const text = await res.text();
	const events = parseICS(text);
	const today = new Date();
	const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
	const todaysEvents = events.filter(e => {
		if(!e.startDate) return false;
		return e.startDate >= startOfToday && e.startDate < endOfToday;
	});
	renderEvents(todaysEvents);
}
function buildScheduleForToday(){
	const base = new Date();
	function t(h, m) {
		const d = new Date(base);
		d.setHours(h, m, 0, 0);
		return d;
	}
	return [
		{ start: t(8,30), end: t(9,57), a: "Period 1", b: "Period 5" },
		{ start: t(9,57), end: t(10,3), a: "Passing", b: "Passing" },
		{ start: t(10,3), end: t(11,30), a: "Period 2", b: "Period 6 (Life Class)" },
		{ start: t(11,30), end: t(12,9), a: "Lunch", b: "Lunch" },
		{ start: t(12,9), end: t(13,36), a: "Period 3", b: "Period 7" },
		{ start: t(13,36), end: t(13,42), a: "Passing", b: "Passing" },
		{ start: t(13,42), end: t(15,9), a: "Period 4", b: "Period 8" },
		{ start: t(15,9), end: t(15,15), a: "Buses Depart", b: "Buses Depart" },
		{ start: t(15,15), end: t(15,15), a: "School Ends", b: "School Ends" },
	];
}
function getActivePeriod(schedule) {
	const now = new Date();
	for (const period of schedule) {
		if (now >= period.start && now <= period.end) return period;
	}
	return null;
}
function getTimeLeft(period) {
	const now = new Date()
	if (now < period.start || now > period.end) return null
	const totalMs = period.end - period.start
	const leftMs = period.end - now
	const percent = 1 - (leftMs / totalMs)
	const totalSec = Math.floor(leftMs / 1000)
	return {
		minutes: Math.floor(totalSec / 60),
		seconds: totalSec % 60,
		percent: Math.min(Math.max(percent, 0), 1) * 100
	}
}
function updateActive() {
	try{
		const schedule = buildScheduleForToday()
		const active = getActivePeriod(schedule)
		const periodEl = document.getElementById("period")
		const untilEl = document.getElementById("until")
		const timeleftEl = document.getElementById("timeleft")
		const progressEl = document.getElementById("progress")
		const tlc = document.getElementById("timeleft-container")
		if (!periodEl || !untilEl || !timeleftEl || !progressEl) return
		if (tlc) tlc.style.display = ""
		if (active && dayType) {
			const i = schedule.indexOf(active) + 1
			const next = schedule[i]
			let label = active.a
			let nextLabel = next ? next.a : ""
			if (dayType == "B") {
				label = active.b
				nextLabel = next ? next.b : ""
			}
			periodEl.textContent = label
			untilEl.textContent = nextLabel ? ("until " + nextLabel + " (" + next.start.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'}) + ")") : ""
			const timeleft = getTimeLeft(active)
			if (timeleft) {
				const secondsStr = String(timeleft.seconds).padStart(2, '0')
				timeleftEl.textContent = timeleft.minutes + "m " + timeleft.seconds + "s"
				progressEl.style.width = timeleft.percent + "%"
				document.title = `${timeleft.minutes}m ${secondsStr}s left`
			}
		} else {
			tlc.style.display = "none"
			document.title = BASE_TITLE
		}
	}catch(e){
		console.error("updateActive crashed:", e)
	}
}
async function init(){
	try{
		await loadEvents()
		if (current_day.startsWith("A Day")) dayType = "A"
		else if (current_day.startsWith("B Day")) dayType = "B"
		else dayType = undefined
	}catch(err){
		console.error(err);
		const ev = document.getElementById('events')
		if (ev) ev.innerHTML = `<div class="error">Error loading events: ${err.message}</div>`;
	}
	updateActive()
	setInterval(updateActive, 1000)
}
init()
