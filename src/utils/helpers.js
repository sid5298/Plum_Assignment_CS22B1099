const findCurrency = (text) => {
    const currencyMatches = text.match(/(?:INR|Rs\.?|₹)/i);
    if (!currencyMatches) return "INR";
    const currency = currencyMatches[0];
    return currency === "₹" ? "INR" : currency.toUpperCase();
};

const findLineWithAmount = (text, amount) => {
    // Split text into lines and find the one containing the amount
    const lines = text.split(/[\n\r]/);
    const amountStr = amount.toString();
    const matchingLine = lines.find(line => 
        line.includes(amountStr) || 
        line.includes(amountStr.replace(/\B(?=(\d{3})+(?!\d))/g, ","))
    );
    return `text: '${matchingLine?.trim() || amount}'`;
};

module.exports = {
    findCurrency,
    findLineWithAmount
};
