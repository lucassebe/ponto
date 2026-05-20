async function isHoliday() {
  const now = new Date();

  const day = now.getDay();

  if (day === 0 || day === 6) {
    return true;
  }

  const today = now.toISOString().split("T")[0];

  const extraHolidays = ["2026-03-19", "2026-04-13"];

  if (extraHolidays.includes(today)) {
    return true;
  }

  try {
    const year = now.getFullYear();

    const response = await fetch(
      `https://brasilapi.com.br/api/feriados/v1/${year}`,
    );

    const holidays = await response.json();

    return holidays.some((holiday) => holiday.date === today);
  } catch (err) {
    console.log("Erro ao consultar feriados:", err.message);

    return false;
  }
}

module.exports = {
  isHoliday,
};
