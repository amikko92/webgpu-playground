export function displayError(msg: string): void {
    const body = document.querySelector("body");
    const errorParagraph = document.createElement("p");
    errorParagraph.innerText = msg;
    body?.prepend(errorParagraph);
}
