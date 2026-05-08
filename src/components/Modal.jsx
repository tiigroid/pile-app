function Modal({ title, body, buttons = [], onClose }) {
	return (
		<div className="modal">
			<div className="modal__content">
				{title && (
					<div className="modal__header">
						<h2 className="modal__title">{title}</h2>
					</div>
				)}
				{body && (
					<div className="modal__body">
						<p className="modal__body-text">{body}</p>
					</div>
				)}
				{buttons.length > 0 && (
					<div className="modal__footer">
						{buttons.map((btn, idx) => (
							<button
								key={idx}
								className={`button button--${btn.variant || 'primary'}`}
								onClick={btn.onClick}
							>
								{btn.label}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	)
}

export default Modal
