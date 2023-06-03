#!/usr/bin/env fish

cd (dirname (status current-filename))

mkdir -p _build
test (count _build/*) -gt 0; and rm -f _build/*

for site in (dirname (find -name meta.fish))
	pushd $site

	if test -e meta.fish -a -e output.template
		source meta.fish
		set -l IFS
		set -l output_file "../_build/$meta_name.md"
		echo -n "Building $meta_name... " >&2
		cp output.template $output_file

		cat $output_file | string replace @url $meta_url > $output_file; or exit
		cat $output_file | string replace @markdown (cat ../common/template.md) > $output_file; or exit
		test -e style.sass; and cat $output_file | string replace @sass (sass style.sass) > $output_file; or exit

		echo 'done.' >&2
	end

	popd
end

echo 'All done, cleaning up temporary files.' >&2
test (count build/*) -gt 0; and rm -f build/*
mv _build/* -t build
rm -d _build
