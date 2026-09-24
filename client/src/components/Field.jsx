import { cloneElement, useId } from 'react';

// A labelled form control with a hint or an error underneath. `children` is the control, or a
// function receiving the id and aria attributes when the control is wrapped in other markup.
export default function Field({ label, hint, error, optional, className, children }) {
  const id = useId();
  const noteId = id + '-note';
  const note = error || hint;
  const controlProps = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': note ? noteId : undefined,
  };
  return (
    <div className={'field' + (error ? ' field--error' : '') + (className ? ' ' + className : '')}>
      <label className="field__label" htmlFor={id}>
        {label}
        {optional && <span className="field__optional">Optional</span>}
      </label>
      {typeof children === 'function' ? children(controlProps) : cloneElement(children, controlProps)}
      {note && <p id={noteId} className={error ? 'field__error' : 'field__hint'}>{note}</p>}
    </div>
  );
}
