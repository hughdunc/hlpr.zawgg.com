document.getElementById('date').textContent = new Date().toLocaleDateString();
const ICS_URL = "./calendar.ics";
let current_day = "No School"
let dayType
const FINALS_WEEK_TITLE = "Finals Week, Semester 2"
const LAST_DAY_TITLE = "MIDDLE and HIGH School Last Day of School"
const FINALS_SCHEDULE_OVERRIDES = {
	"06-04": { dayType: "B" },
	"06-05": { periods: ["Period 1", "Period 2"] },
	"06-08": { periods: ["Period 3", "Period 4"] }
}
let finalsWeekToday = false
let finalsScheduleOverride = null
let lastDayDate = null
let lastDayToday = false
let summerCelebrationStarted = false

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
function normalizeSummary(summary) {
	return (summary || "").trim().toLowerCase();
}
function isFinalsWeekSummary(summary) {
	return normalizeSummary(summary).includes(FINALS_WEEK_TITLE.toLowerCase());
}
function isLastDaySummary(summary) {
	return normalizeSummary(summary) === LAST_DAY_TITLE.toLowerCase();
}
function isABDaySummary(summary) {
	return summary === "B Day-Periods 5-8" || summary === "A Day-Periods 1-4";
}
function isScheduleSummary(summary) {
	return isABDaySummary(summary) || isFinalsWeekSummary(summary);
}
function startOfDay(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function isSameDay(a, b) {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dateKey(date) {
	return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function findLastDayDate(events, todayStart) {
	const lastDayEvents = events.filter(e => e.startDate && isLastDaySummary(e.summary));
	if (!lastDayEvents.length) return null;
	const pastEvents = lastDayEvents.filter(e => startOfDay(e.startDate) <= todayStart);
	if (pastEvents.length) {
		pastEvents.sort((a, b) => a.startDate - b.startDate);
		return pastEvents[pastEvents.length - 1].startDate;
	}
	lastDayEvents.sort((a, b) => a.startDate - b.startDate);
	return lastDayEvents[0].startDate;
}
function getLastDayTriggerTime(date) {
	const trigger = startOfDay(date);
	trigger.setHours(11, 29, 0, 0);
	return trigger;
}
function getSummerMode(now) {
	if (!lastDayDate) return false;
	if (dayType) return false;
	const todayStart = startOfDay(now);
	const lastDayStart = startOfDay(lastDayDate);
	if (isSameDay(todayStart, lastDayStart)) {
		return now >= getLastDayTriggerTime(lastDayDate);
	}
	return todayStart > lastDayStart;
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
		if (isScheduleSummary(e.summary)) {
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
	const startOfToday = startOfDay(today);
	const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
	lastDayDate = findLastDayDate(events, startOfToday);
	const todaysEvents = events.filter(e => {
		if(!e.startDate) return false;
		return e.startDate >= startOfToday && e.startDate < endOfToday;
	});
	finalsWeekToday = todaysEvents.some(e => isFinalsWeekSummary(e.summary));
	finalsScheduleOverride = finalsWeekToday ? getFinalsScheduleOverride(startOfToday) : null;
	lastDayToday = lastDayDate ? isSameDay(startOfToday, startOfDay(lastDayDate)) : false;
	dayType = undefined;
	current_day = "No School";
	if (finalsWeekToday) {
		current_day = FINALS_WEEK_TITLE;
		if (finalsScheduleOverride?.dayType) dayType = finalsScheduleOverride.dayType;
	} else {
		const abEvent = todaysEvents.find(e => isABDaySummary(e.summary));
		if (abEvent) {
			current_day = abEvent.summary;
			dayType = current_day.startsWith("A Day") ? "A" : "B";
		}
	}
	renderEvents(todaysEvents);
}
function buildStandardSchedule(base){
	function t(h, m) {
		const d = new Date(base);
		d.setHours(h, m, 0, 0);
		return d;
	}
	return [
		{ start: t(8,30), end: t(9,55), a: "Period 1", b: "Period 5" },
		{ start: t(9,55), end: t(10,4), a: "Passing", b: "Passing" },
		{ start: t(10,4), end: t(11,29), a: "Period 2", b: "Period 6" },
		{ start: t(11,29), end: t(12,9), a: "Lunch", b: "Lunch" },
		{ start: t(12,9), end: t(13,34), a: "Period 3", b: "Period 7" },
		{ start: t(13,34), end: t(13,40), a: "Passing", b: "Passing" },
		{ start: t(13,40), end: t(15,5), a: "Period 4", b: "Period 8" },
		{ start: t(15,5), end: t(15,5), a: "school ends", b: "school ends" },
	];
}
function buildFinalsSchedule(base, periods){
	function t(h, m) {
		const d = new Date(base);
		d.setHours(h, m, 0, 0);
		return d;
	}
	return [
		{ start: t(8,30), end: t(9,55), label: periods[0] },
		{ start: t(9,55), end: t(10,4), label: "Passing" },
		{ start: t(10,4), end: t(11,29), label: periods[1] },
		{ start: t(11,29), end: t(12,0), label: "Lunch" },
		{ start: t(12,0), end: t(12,0), label: "school ends" },
	];
}
function getFinalsScheduleOverride(baseDate){
	const key = dateKey(baseDate);
	const override = FINALS_SCHEDULE_OVERRIDES[key];
	if (!override) return null;
	if (override.dayType === "B") {
		return { schedule: buildStandardSchedule(baseDate), dayType: "B" };
	}
	if (override.periods) {
		return { schedule: buildFinalsSchedule(baseDate, override.periods) };
	}
	return null;
}
function buildScheduleForToday(){
	const base = new Date();
	if (finalsScheduleOverride?.schedule) return finalsScheduleOverride.schedule;
	return buildStandardSchedule(base);
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
function getPeriodLabel(period) {
	if (!period) return "";
	if (period.label) return period.label;
	if (dayType === "A") return period.a;
	if (dayType === "B") return period.b;
	return "";
}
function showSummerModal(show) {
	const modal = document.getElementById("summer-modal");
	if (!modal) return;
	modal.classList.toggle("hidden", !show);
}
function launchConfetti() {
	const container = document.getElementById("confetti-container");
	if (!container) return;
	container.innerHTML = "";
	container.classList.remove("hidden");
	const colors = ["#ff0000", "#ff7a00", "#ffd500", "#00d26a", "#00b5ff", "#7a5cff", "#ff4fd8"];
	const pieces = 140;
	let maxDuration = 0;
	for (let i = 0; i < pieces; i++) {
		const piece = document.createElement("div");
		piece.className = "confetti-piece";
		const x = (Math.random() * 320) - 160;
		const y = 360 + Math.random() * 240;
		const rotation = Math.random() * 720;
		const delay = Math.random() * 300;
		const duration = 2800 + Math.random() * 1200;
		maxDuration = Math.max(maxDuration, duration + delay);
		piece.style.setProperty("--x", `${x}px`);
		piece.style.setProperty("--y", `${y}px`);
		piece.style.setProperty("--r", `${rotation}deg`);
		piece.style.background = colors[i % colors.length];
		piece.style.animationDelay = `${delay}ms`;
		piece.style.animationDuration = `${duration}ms`;
		container.appendChild(piece);
	}
	setTimeout(() => {
		container.innerHTML = "";
	}, maxDuration + 200);
}
function maybeStartSummerCelebration(now) {
	if (summerCelebrationStarted) return;
	if (!lastDayDate) return;
	if (!isSameDay(now, lastDayDate)) return;
	if (now < getLastDayTriggerTime(lastDayDate)) return;
	summerCelebrationStarted = true;
	showSummerModal(true);
	launchConfetti();
}
function updateActive() {
	try{
		const now = new Date()
		lastDayToday = lastDayDate ? isSameDay(now, lastDayDate) : false;
		maybeStartSummerCelebration(now);
		showSummerModal(summerCelebrationStarted && lastDayToday);
		const summerMode = getSummerMode(now);
		const periodEl = document.getElementById("period")
		const untilEl = document.getElementById("until")
		const timeleftEl = document.getElementById("timeleft")
		const progressEl = document.getElementById("progress")
		const tlc = document.getElementById("timeleft-container")
		const progressContainer = progressEl ? progressEl.parentElement : null;
		if (!periodEl || !untilEl || !timeleftEl || !progressEl) return
		if (summerMode) {
			if (tlc) tlc.style.display = "";
			if (progressContainer) progressContainer.style.display = "none";
			periodEl.textContent = "School's out";
			timeleftEl.textContent = "Have a great summer!";
			untilEl.textContent = "";
			document.title = BASE_TITLE;
			return;
		}
		if (progressContainer) progressContainer.style.display = "";
		const schedule = buildScheduleForToday()
		const active = getActivePeriod(schedule)
		if (tlc) tlc.style.display = ""
		if (active) {
			const i = schedule.indexOf(active) + 1
			const next = schedule[i]
			const label = getPeriodLabel(active)
			const nextLabel = getPeriodLabel(next)
			if (!label) {
				tlc.style.display = "none"
				document.title = BASE_TITLE
				return;
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
	}catch(err){
		console.error(err);
		const ev = document.getElementById('events')
		if (ev) ev.innerHTML = `<div class="error">Error loading events: ${err.message}</div>`;
	}
	updateActive()
	setInterval(updateActive, 1000)
}
init()
