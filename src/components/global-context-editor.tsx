import { useEffect, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface GlobalContextEditorProps {
	value: string | null;
	onSave: (text: string) => Promise<void>;
}

export function GlobalContextEditor({
	value,
	onSave,
}: GlobalContextEditorProps) {
	const [text, set_text] = useState(value ?? "");
	const [saving, set_saving] = useState(false);

	useEffect(() => {
		set_text(value ?? "");
	}, [value]);

	const handle_save = async () => {
		try {
			set_saving(true);
			await onSave(text);
		} finally {
			set_saving(false);
		}
	};

	const is_dirty = text !== (value ?? "");

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center gap-2">
					<CardTitle className="text-base">Global Context</CardTitle>
					<InfoTip title="Global Context" side="right" align="start">
						<div className="space-y-1.5">
							<p>
								A free-text description that applies to{" "}
								<strong>all collections</strong>. Use it to describe your
								overall project, domain, or any context that's relevant across
								all your documents.
							</p>
							<p>
								This helps QMD understand the broader context when searching,
								improving the relevance of results. For example:{" "}
								<em>
									"This is a medical research project focused on oncology
									clinical trials."
								</em>
							</p>
						</div>
					</InfoTip>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				<Textarea
					className="min-h-[100px] resize-y"
					placeholder="Add a global context description that applies to all collections..."
					value={text}
					onChange={(e) => set_text(e.target.value)}
				/>
				<div className="flex justify-end">
					<Button
						size="sm"
						onClick={handle_save}
						disabled={!is_dirty || saving}
					>
						{saving ? "Saving..." : "Save"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
