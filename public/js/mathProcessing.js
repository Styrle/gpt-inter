// For processing math (Markdown/MathJax integration)
export function processTextWithMathAndMarkdown(text) {
    // Implement logic as per your existing code
    // This can contain the mathPattern logic and finalHTML rendering.
    // Keep this modular so ChatUI can call it.
    // For brevity, we'll assume a function similar to the original code.

    const mathPattern = /(\$\$[\s\S]*?\$\$)|(\\\([\s\S]*?\\\))|(\$[\s\S]*?\$)|(\\\[[\s\S]*?\\\])/g;

    function restoreMathSegments(parsedHTML, mathSegments) {
        let finalHTML = parsedHTML;
        mathSegments.forEach((segment, i) => {
            finalHTML = finalHTML.replace(`%%%MATH${i}%%%`, segment);
        });
        return finalHTML;
    }

    const mathSegments = [];
    let placeholderIndex = 0;

    const textWithPlaceholders = text.replace(mathPattern, (match) => {
        mathSegments.push(match);
        return `%%%MATH${placeholderIndex++}%%%`;
    });

    // Use marked.js or your chosen markdown parser (assume marked is globally loaded)
    const parsedHTML = marked.parse(textWithPlaceholders);
    const finalHTML = restoreMathSegments(parsedHTML, mathSegments);

    return finalHTML;
}
